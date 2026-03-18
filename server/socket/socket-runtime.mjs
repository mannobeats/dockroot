import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	closeLocalTerminalSession,
	createLocalTerminalSession,
	resizeLocalTerminalSession,
	writeLocalTerminalInput,
} from "../../local-terminal.mjs";

const DEFAULT_SOCKET_EVENT_RATE_LIMITS = {
	"terminal:create": { capacity: 4, refillPerSecond: 0.25 },
	"terminal:input": { capacity: 160, refillPerSecond: 100 },
	"terminal:resize": { capacity: 24, refillPerSecond: 12 },
	"terminal:close": { capacity: 16, refillPerSecond: 8 },
	"logs:subscribe": { capacity: 6, refillPerSecond: 0.5 },
	"logs:unsubscribe": { capacity: 12, refillPerSecond: 3 },
};

export function createSocketRuntimeService({
	io,
	sql,
	dockerBinary,
	execFileAsync,
	getAppBaseUrl,
	isPrivilegedRole,
	isTrustedOrigin,
	emitRuntimeAction,
	maxSocketSessionsPerUser = 5,
	maxSocketConnectionsPerUser = 12,
	socketIdleTimeoutMs = 10 * 60 * 1000,
	socketEventRateLimits = DEFAULT_SOCKET_EVENT_RATE_LIMITS,
	logSessionKillTimeoutMs = 1_500,
}) {
	const terminalSessions = new Map();
	const logSessions = new Map();
	const wsRejectionCounters = {
		origin: 0,
		unauthorized: 0,
		connectionLimit: 0,
		rateLimited: 0,
	};
	let attached = false;

	function getSocketRuntimeMetrics() {
		let authenticatedConnections = 0;
		for (const socket of io.of("/").sockets.values()) {
			if (socket.data?.userId) {
				authenticatedConnections += 1;
			}
		}
		return {
			connections: io.of("/").sockets.size,
			authenticatedConnections,
			terminalSessions: terminalSessions.size,
			logSessions: logSessions.size,
			rejections: { ...wsRejectionCounters },
		};
	}

	function clampTerminalColumns(value) {
		const parsed = Number(value || 120);
		return Number.isFinite(parsed) ? Math.max(40, Math.min(300, Math.floor(parsed))) : 120;
	}

	function clampTerminalRows(value) {
		const parsed = Number(value || 36);
		return Number.isFinite(parsed) ? Math.max(12, Math.min(120, Math.floor(parsed))) : 36;
	}

	async function getSessionFromSocket(socket) {
		const cookie = socket.request.headers.cookie;
		if (!cookie) {
			return null;
		}

		const response = await fetch(`${getAppBaseUrl()}/api/auth/get-session?disableCookieCache=true`, {
			headers: {
				cookie,
				accept: "application/json",
			},
		});

		if (!response.ok) {
			return null;
		}

		const payload = await response.json().catch(() => null);
		if (!payload?.user?.id) {
			return null;
		}

		return {
			userId: payload.user.id,
			role:
				payload.user.role === "owner" || payload.user.role === "admin" || payload.user.role === "member"
					? payload.user.role
					: "member",
		};
	}

	async function requestTerminalApiWithCookie(authCookie, path, init = {}) {
		const response = await fetch(`${getAppBaseUrl()}${path}`, {
			...init,
			headers: {
				accept: "application/json",
				...(authCookie ? { cookie: authCookie } : {}),
				...(init.headers || {}),
			},
			cache: "no-store",
		});
		const payload = await response.json().catch(() => ({}));
		return { ok: response.ok, payload };
	}

	async function resolveOwnedEnvironmentId(userId, environmentId) {
		const normalized = typeof environmentId === "string" && environmentId.trim() ? environmentId.trim() : "";
		if (!normalized) {
			return "";
		}

		const rows = await sql`
			select id
			from environments
			where id = ${normalized}
			  and created_by_user_id = ${userId}
			limit 1
		`;

		return rows[0]?.id ? String(rows[0].id) : null;
	}

	async function resolveOwnedEnvironmentWithKind(userId, environmentId) {
		const normalized = typeof environmentId === "string" && environmentId.trim() ? environmentId.trim() : "";
		if (!normalized) {
			return { id: "", kind: "local" };
		}

		const rows = await sql`
			select id, kind
			from environments
			where id = ${normalized}
			  and created_by_user_id = ${userId}
			limit 1
		`;

		if (!rows[0]?.id) {
			return null;
		}
		return { id: String(rows[0].id), kind: String(rows[0].kind || "local") };
	}

	function consumeSocketRateLimit(socket, eventName, cost = 1) {
		const rule = socketEventRateLimits[eventName];
		if (!rule) {
			return true;
		}

		const now = Date.now();
		const key = `rate:${eventName}`;
		const state = socket.data[key] || {
			tokens: rule.capacity,
			updatedAt: now,
		};
		const elapsedSeconds = Math.max(0, (now - state.updatedAt) / 1000);
		const replenished = Math.min(rule.capacity, state.tokens + elapsedSeconds * rule.refillPerSecond);
		const nextState = {
			tokens: replenished,
			updatedAt: now,
		};

		if (nextState.tokens < cost) {
			socket.data[key] = nextState;
			wsRejectionCounters.rateLimited += 1;
			return false;
		}

		nextState.tokens -= cost;
		socket.data[key] = nextState;
		return true;
	}

	async function closeTrackedTerminalSession(sessionId, options = {}) {
		const { skipBackendClose = false } = options;
		const session = terminalSessions.get(sessionId);
		if (!session) {
			return;
		}

		terminalSessions.delete(sessionId);
		if (session.idleTimer) {
			clearTimeout(session.idleTimer);
			session.idleTimer = null;
		}
		if (session.pollAbort) {
			session.pollAbort.abort();
		}

		if (session.kind === "direct" && !skipBackendClose) {
			try {
				closeLocalTerminalSession(session.backendSessionId);
			} catch {
				// Already cleaned up.
			}
		} else if (session.kind === "proxy" && !skipBackendClose) {
			const environmentQuery = session.environmentId
				? `?environmentId=${encodeURIComponent(session.environmentId)}`
				: "";
			try {
				await requestTerminalApiWithCookie(
					session.authCookie,
					`/api/runtime/terminal/${encodeURIComponent(session.backendSessionId)}${environmentQuery}`,
					{ method: "DELETE" },
				);
			} catch {
				// Local state is already cleaned up; ignore backend close failures.
			}
		}
	}

	function teardownLogProcess(processEntry, signal = "SIGTERM") {
		if (!processEntry || processEntry.cleanedUp) {
			return;
		}

		processEntry.cleanedUp = true;
		if (processEntry.forceKillTimer) {
			clearTimeout(processEntry.forceKillTimer);
			processEntry.forceKillTimer = null;
		}
		processEntry.child.stdout?.off("data", processEntry.onStdout);
		processEntry.child.stderr?.off("data", processEntry.onStderr);
		processEntry.child.off("close", processEntry.onClose);
		processEntry.child.off("error", processEntry.onError);

		if (!processEntry.closed) {
			try {
				processEntry.child.kill(signal);
			} catch {
				// Child may already be gone.
			}

			if (signal === "SIGTERM") {
				processEntry.forceKillTimer = setTimeout(() => {
					if (processEntry.closed) {
						return;
					}
					try {
						processEntry.child.kill("SIGKILL");
					} catch {
						// Child may already be gone.
					}
				}, logSessionKillTimeoutMs);
				processEntry.forceKillTimer.unref?.();
			}
		}
	}

	function closeTrackedLogSession(sessionId) {
		const session = logSessions.get(sessionId);
		if (!session) {
			return;
		}

		logSessions.delete(sessionId);
		for (const processEntry of session.processes) {
			teardownLogProcess(processEntry);
		}
	}

	async function canAccessStackRoom(userId, role, room) {
		if (isPrivilegedRole(role)) {
			return true;
		}

		const stackId = room.startsWith("stack:") ? room.slice("stack:".length) : "";
		if (!stackId) {
			return false;
		}

		const rows = await sql`
			select 1
			from stacks
			where id = ${stackId}
			  and created_by_user_id = ${userId}
			limit 1
		`;

		return rows.length > 0;
	}

	async function listOwnedStackSlugs(userId) {
		const rows = await sql`
			select slug
			from stacks
			where created_by_user_id = ${userId}
		`;

		return new Set(rows.map((row) => row.slug).filter(Boolean));
	}

	async function getContainerComposeProject(containerId) {
		try {
			const { stdout } = await execFileAsync(
				dockerBinary,
				["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}', containerId],
				{ maxBuffer: 1024 * 256 },
			);
			return stdout.trim() || null;
		} catch {
			return null;
		}
	}

	async function canAccessContainer(userId, role, containerId) {
		if (isPrivilegedRole(role)) {
			return true;
		}

		const composeProject = await getContainerComposeProject(containerId);
		if (!composeProject) {
			return false;
		}

		const ownedSlugs = await listOwnedStackSlugs(userId);
		return ownedSlugs.has(composeProject);
	}

	function attach() {
		if (attached) {
			return;
		}
		attached = true;

		io.use(async (socket, nextMiddleware) => {
			try {
				const requestOrigin = String(socket.request.headers.origin || "").trim();
				if (requestOrigin && !isTrustedOrigin(requestOrigin)) {
					wsRejectionCounters.origin += 1;
					nextMiddleware(new Error("Socket origin denied."));
					return;
				}

				const auth = await getSessionFromSocket(socket);
				if (!auth) {
					wsRejectionCounters.unauthorized += 1;
					nextMiddleware(new Error("Unauthorized"));
					return;
				}

				let activeConnectionsForUser = 0;
				for (const connected of io.of("/").sockets.values()) {
					if (connected.data?.userId === auth.userId) {
						activeConnectionsForUser += 1;
					}
				}
				if (activeConnectionsForUser >= maxSocketConnectionsPerUser) {
					wsRejectionCounters.connectionLimit += 1;
					nextMiddleware(new Error("Too many active socket connections."));
					return;
				}

				socket.data.userId = auth.userId;
				socket.data.role = auth.role;
				nextMiddleware();
			} catch (error) {
				nextMiddleware(error instanceof Error ? error : new Error("Unauthorized"));
			}
		});

		io.on("connection", (socket) => {
			const authCookie = String(socket.request.headers.cookie || "");
			emitRuntimeAction("socket.connected", {
				userId: socket.data.userId,
				role: socket.data.role,
				socketId: socket.id,
				environmentId: null,
			});

			async function requestTerminalApi(path, init = {}) {
				return requestTerminalApiWithCookie(authCookie, path, init);
			}

			function scheduleTerminalIdleTimeout(sessionId) {
				const session = terminalSessions.get(sessionId);
				if (!session) {
					return;
				}

				if (session.idleTimer) {
					clearTimeout(session.idleTimer);
					session.idleTimer = null;
				}

				session.idleTimer = setTimeout(() => {
					socket.emit("terminal:exit", {
						sessionId,
						exitCode: -1,
					});
					void closeTrackedTerminalSession(sessionId);
				}, socketIdleTimeoutMs);
				session.idleTimer.unref?.();
			}

			socket.on("room:join", async (room) => {
				if (
					typeof room === "string" &&
					room.length > 0 &&
					(await canAccessStackRoom(socket.data.userId, socket.data.role, room))
				) {
					socket.join(room);
				}
			});

			socket.on("room:leave", (room) => {
				if (typeof room === "string" && room.length > 0) {
					socket.leave(room);
				}
			});

			socket.on("terminal:create", async (payload, callback) => {
				try {
					if (!consumeSocketRateLimit(socket, "terminal:create")) {
						callback?.({ error: "Too many terminal requests. Please wait a moment." });
						emitRuntimeAction("terminal.create.failed", {
							userId: socket.data.userId,
							socketId: socket.id,
							reason: "rate_limited",
							environmentId: payload?.environmentId,
						});
						return;
					}

					if (!payload?.containerId) {
						callback?.({ error: "containerId is required." });
						emitRuntimeAction("terminal.create.failed", {
							userId: socket.data.userId,
							socketId: socket.id,
							reason: "missing_container_id",
							environmentId: payload?.environmentId,
						});
						return;
					}

					const resolvedEnvironment = await resolveOwnedEnvironmentWithKind(
						socket.data.userId,
						payload?.environmentId,
					);
					if (resolvedEnvironment === null) {
						callback?.({ error: "Environment not found." });
						emitRuntimeAction("terminal.create.failed", {
							userId: socket.data.userId,
							socketId: socket.id,
							containerId: payload.containerId,
							reason: "invalid_environment",
							environmentId: payload?.environmentId,
						});
						return;
					}

					const resolvedEnvironmentId = resolvedEnvironment.id;
					const isLocal = resolvedEnvironment.kind === "local" || !resolvedEnvironment.kind;

					let userSessionCount = 0;
					for (const session of terminalSessions.values()) {
						if (session.socketId === socket.id || (session.userId && session.userId === socket.data.userId)) {
							userSessionCount += 1;
						}
					}
					if (userSessionCount >= maxSocketSessionsPerUser) {
						callback?.({ error: "Too many active terminal sessions. Close an existing session first." });
						emitRuntimeAction("terminal.create.failed", {
							userId: socket.data.userId,
							socketId: socket.id,
							containerId: payload.containerId,
							reason: "session_limit",
							environmentId: resolvedEnvironmentId || null,
						});
						return;
					}

					if (isLocal) {
						const sessionId = randomUUID();
						const result = await createLocalTerminalSession({
							target: "container",
							containerId: payload.containerId,
							shell: payload.shell,
							customShell: payload.customShell,
							cols: clampTerminalColumns(payload?.cols),
							rows: clampTerminalRows(payload?.rows),
							userId: socket.data.userId,
							onData: (data) => {
								const session = terminalSessions.get(sessionId);
								if (session?.socketId === socket.id) {
									socket.emit("terminal:data", { sessionId, data });
								}
							},
							onExit: ({ exitCode }) => {
								const session = terminalSessions.get(sessionId);
								if (session?.socketId === socket.id) {
									socket.emit("terminal:exit", { sessionId, exitCode: exitCode ?? 0 });
								}
								void closeTrackedTerminalSession(sessionId, { skipBackendClose: true });
							},
						});

						terminalSessions.set(sessionId, {
							kind: "direct",
							backendSessionId: result.sessionId,
							environmentId: resolvedEnvironmentId || "",
							socketId: socket.id,
							userId: socket.data.userId,
							authCookie,
							idleTimer: null,
						});

						callback?.({ sessionId });
						emitRuntimeAction("terminal.create.succeeded", {
							userId: socket.data.userId,
							socketId: socket.id,
							containerId: payload.containerId,
							sessionId,
							environmentId: resolvedEnvironmentId || null,
							mode: "direct",
						});

						scheduleTerminalIdleTimeout(sessionId);
					} else {
						const createResult = await requestTerminalApi("/api/runtime/terminal", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								target: "container",
								containerId: payload.containerId,
								environmentId: resolvedEnvironmentId || undefined,
								shell: payload.shell,
								customShell: payload.customShell,
								cols: clampTerminalColumns(payload?.cols),
								rows: clampTerminalRows(payload?.rows),
							}),
						});

						const backendSessionId = String(createResult.payload?.sessionId || "");
						if (!createResult.ok || !backendSessionId) {
							callback?.({
								error:
									String(createResult.payload?.error || "").trim() ||
									"Unable to start terminal session.",
							});
							emitRuntimeAction("terminal.create.failed", {
								userId: socket.data.userId,
								socketId: socket.id,
								containerId: payload.containerId,
								reason: "backend_create_failed",
								environmentId: resolvedEnvironmentId || null,
							});
							return;
						}

						const sessionId = randomUUID();
						const pollAbort = new AbortController();
						terminalSessions.set(sessionId, {
							kind: "proxy",
							backendSessionId,
							environmentId: resolvedEnvironmentId || "",
							socketId: socket.id,
							userId: socket.data.userId,
							authCookie,
							idleTimer: null,
							pollAbort,
							cursor: 0,
							writeQueue: Promise.resolve(),
						});

						callback?.({ sessionId });
						emitRuntimeAction("terminal.create.succeeded", {
							userId: socket.data.userId,
							socketId: socket.id,
							containerId: payload.containerId,
							sessionId,
							environmentId: resolvedEnvironmentId || null,
							mode: "proxy",
						});

						const poll = async () => {
							try {
								while (true) {
									const session = terminalSessions.get(sessionId);
									if (!session || session.kind !== "proxy" || pollAbort.signal.aborted) {
										return;
									}

									const environmentQuery = session.environmentId
										? `&environmentId=${encodeURIComponent(session.environmentId)}`
										: "";
									const readResult = await requestTerminalApi(
										`/api/runtime/terminal/${encodeURIComponent(session.backendSessionId)}?cursor=${Number(session.cursor || 0)}&waitMs=1200${environmentQuery}`,
										{ signal: pollAbort.signal },
									);

									if (pollAbort.signal.aborted) {
										return;
									}
									if (!readResult.ok) {
										socket.emit("terminal:exit", { sessionId, exitCode: -2 });
										await closeTrackedTerminalSession(sessionId);
										return;
									}

									const chunks = Array.isArray(readResult.payload?.chunks) ? readResult.payload.chunks : [];
									for (const chunk of chunks) {
										socket.emit("terminal:data", { sessionId, data: String(chunk || "") });
									}
									session.cursor = Number(readResult.payload?.cursor || session.cursor || 0);

									if (readResult.payload?.closed) {
										socket.emit("terminal:exit", {
											sessionId,
											exitCode: Number(readResult.payload?.exitCode ?? 0),
										});
										await closeTrackedTerminalSession(sessionId, { skipBackendClose: true });
										return;
									}
								}
							} catch {
								if (pollAbort.signal.aborted) {
									return;
								}
								socket.emit("terminal:exit", { sessionId, exitCode: -2 });
								await closeTrackedTerminalSession(sessionId);
							}
						};

						void poll();
						scheduleTerminalIdleTimeout(sessionId);
					}
				} catch (error) {
					callback?.({
						error: error instanceof Error ? error.message : "Unable to start terminal session.",
					});
					emitRuntimeAction("terminal.create.failed", {
						userId: socket.data.userId,
						socketId: socket.id,
						containerId: payload?.containerId,
						reason: "unexpected_error",
						environmentId: payload?.environmentId,
					});
				}
			});

			socket.on("terminal:input", (payload) => {
				if (!consumeSocketRateLimit(socket, "terminal:input")) {
					emitRuntimeAction("terminal.input.dropped", {
						userId: socket.data.userId,
						socketId: socket.id,
						sessionId: payload?.sessionId,
						reason: "rate_limited",
					});
					return;
				}

				const session = terminalSessions.get(payload?.sessionId);
				if (!session || session.socketId !== socket.id || typeof payload?.data !== "string") {
					return;
				}

				if (session.kind === "direct") {
					try {
						writeLocalTerminalInput(session.backendSessionId, String(payload.data || "").slice(0, 8192));
					} catch {
						// Session may have been closed.
					}
					scheduleTerminalIdleTimeout(payload.sessionId);
				} else if (session.kind === "proxy") {
					const environmentQuery = session.environmentId
						? `?environmentId=${encodeURIComponent(session.environmentId)}`
						: "";
					session.writeQueue = session.writeQueue
						.then(() =>
							requestTerminalApi(
								`/api/runtime/terminal/${encodeURIComponent(session.backendSessionId)}${environmentQuery}`,
								{
									method: "POST",
									headers: { "content-type": "application/json" },
									body: JSON.stringify({
										type: "input",
										data: String(payload.data || "").slice(0, 8192),
									}),
								},
							),
						)
						.catch(() => {});
					scheduleTerminalIdleTimeout(payload.sessionId);
				}
			});

			socket.on("terminal:resize", (payload) => {
				if (!consumeSocketRateLimit(socket, "terminal:resize")) {
					return;
				}

				const session = terminalSessions.get(payload?.sessionId);
				if (!session || session.socketId !== socket.id) {
					return;
				}

				if (session.kind === "direct") {
					try {
						resizeLocalTerminalSession(
							session.backendSessionId,
							clampTerminalColumns(payload?.cols),
							clampTerminalRows(payload?.rows),
						);
					} catch {
						// Session may have been closed.
					}
				} else if (session.kind === "proxy") {
					const environmentQuery = session.environmentId
						? `?environmentId=${encodeURIComponent(session.environmentId)}`
						: "";
					void requestTerminalApi(
						`/api/runtime/terminal/${encodeURIComponent(session.backendSessionId)}${environmentQuery}`,
						{
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								type: "resize",
								cols: clampTerminalColumns(payload?.cols),
								rows: clampTerminalRows(payload?.rows),
							}),
						},
					);
				}
			});

			socket.on("terminal:close", (payload) => {
				if (!consumeSocketRateLimit(socket, "terminal:close")) {
					return;
				}

				const session = terminalSessions.get(payload?.sessionId);
				if (session?.socketId === socket.id) {
					emitRuntimeAction("terminal.close", {
						userId: socket.data.userId,
						socketId: socket.id,
						sessionId: payload.sessionId,
						environmentId: session.environmentId || null,
					});
					void closeTrackedTerminalSession(payload.sessionId);
				}
			});

			socket.on("logs:subscribe", async (payload, callback) => {
				try {
					if (!consumeSocketRateLimit(socket, "logs:subscribe")) {
						callback?.({ error: "Too many log stream requests. Please wait a moment." });
						emitRuntimeAction("logs.subscribe.failed", {
							userId: socket.data.userId,
							socketId: socket.id,
							reason: "rate_limited",
							environmentId: payload?.environmentId,
						});
						return;
					}

					const resolvedEnvironmentId = await resolveOwnedEnvironmentId(
						socket.data.userId,
						payload?.environmentId,
					);
					if (resolvedEnvironmentId === null) {
						callback?.({ error: "Environment not found." });
						emitRuntimeAction("logs.subscribe.failed", {
							userId: socket.data.userId,
							socketId: socket.id,
							reason: "invalid_environment",
							environmentId: payload?.environmentId,
						});
						return;
					}

					const sessionId = payload?.sessionId || randomUUID();
					closeTrackedLogSession(sessionId);

					const requestedContainerIds = Array.isArray(payload?.containerIds)
						? payload.containerIds.filter((value) => typeof value === "string" && value.length > 0)
						: [];
					const allowedContainerIds = [];

					for (const containerId of requestedContainerIds) {
						if (await canAccessContainer(socket.data.userId, socket.data.role, containerId)) {
							allowedContainerIds.push(containerId);
						}
					}

					if (!allowedContainerIds.length) {
						callback?.({ error: "No accessible containers selected for log streaming." });
						emitRuntimeAction("logs.subscribe.failed", {
							userId: socket.data.userId,
							socketId: socket.id,
							reason: "no_accessible_containers",
							environmentId: resolvedEnvironmentId || null,
						});
						return;
					}

					const processes = allowedContainerIds.map((containerId) => {
						const child = spawn(
							dockerBinary,
							["logs", "-f", "--tail", String(payload?.tail || 150), "--timestamps", containerId],
							{ stdio: ["ignore", "pipe", "pipe"] },
						);

						const processEntry = {
							child,
							forceKillTimer: null,
							closed: false,
							cleanedUp: false,
							onStdout: (data) => {
								socket.emit("logs:data", { sessionId, containerId, chunk: data.toString() });
							},
							onStderr: (data) => {
								socket.emit("logs:data", { sessionId, containerId, chunk: data.toString() });
							},
							onClose: (code) => {
								processEntry.closed = true;
								if (processEntry.forceKillTimer) {
									clearTimeout(processEntry.forceKillTimer);
									processEntry.forceKillTimer = null;
								}
								teardownLogProcess(processEntry, "SIGKILL");
								socket.emit("logs:exit", { sessionId, containerId, code });
							},
						};

						child.stdout.on("data", processEntry.onStdout);
						child.stderr.on("data", processEntry.onStderr);
						child.on("close", processEntry.onClose);
						processEntry.onError = () => {
							socket.emit("logs:data", {
								sessionId,
								containerId,
								chunk: "Unable to stream logs.\n",
							});
						};
						child.on("error", processEntry.onError);

						return processEntry;
					});

					logSessions.set(sessionId, {
						processes,
						socketId: socket.id,
						environmentId: resolvedEnvironmentId || "",
					});

					callback?.({ sessionId });
					emitRuntimeAction("logs.subscribe.succeeded", {
						userId: socket.data.userId,
						socketId: socket.id,
						sessionId,
						containerCount: allowedContainerIds.length,
						environmentId: resolvedEnvironmentId || null,
					});
				} catch (error) {
					callback?.({
						error: error instanceof Error ? error.message : "Unable to start log stream.",
					});
					emitRuntimeAction("logs.subscribe.failed", {
						userId: socket.data.userId,
						socketId: socket.id,
						reason: "unexpected_error",
						environmentId: payload?.environmentId,
					});
				}
			});

			socket.on("logs:unsubscribe", (payload) => {
				if (!consumeSocketRateLimit(socket, "logs:unsubscribe")) {
					return;
				}

				const session = logSessions.get(payload?.sessionId);
				if (session?.socketId === socket.id) {
					emitRuntimeAction("logs.unsubscribe", {
						userId: socket.data.userId,
						socketId: socket.id,
						sessionId: payload.sessionId,
						environmentId: session.environmentId || null,
					});
					closeTrackedLogSession(payload.sessionId);
				}
			});

			socket.on("disconnect", () => {
				emitRuntimeAction("socket.disconnected", {
					userId: socket.data.userId,
					role: socket.data.role,
					socketId: socket.id,
					environmentId: null,
				});
				for (const [sessionId, session] of terminalSessions.entries()) {
					if (session.socketId === socket.id) {
						void closeTrackedTerminalSession(sessionId);
					}
				}

				for (const [sessionId, session] of logSessions.entries()) {
					if (session.socketId === socket.id) {
						closeTrackedLogSession(sessionId);
					}
				}
			});
		});
	}

	async function closeAllSessions() {
		const terminalClosures = Array.from(terminalSessions.keys(), (sessionId) =>
			closeTrackedTerminalSession(sessionId),
		);
		for (const sessionId of Array.from(logSessions.keys())) {
			closeTrackedLogSession(sessionId);
		}
		await Promise.allSettled(terminalClosures);
	}

	return {
		attach,
		closeAllSessions,
		getSocketRuntimeMetrics,
	};
}
