import {
	closeLocalTerminalBackend,
	resizeLocalTerminalSessionWindow,
	startLocalTerminalSession,
	writeLocalTerminalSessionInput,
} from "./terminal-local.mjs";
import {
	closeProxyTerminalBackend,
	resizeProxyTerminalSessionWindow,
	startProxyTerminalSession,
	writeProxyTerminalSessionInput,
} from "./terminal-proxy.mjs";

export function createTerminalRuntime({
	emitRuntimeAction,
	resolveOwnedEnvironmentWithKind,
	requestTerminalApiWithCookie,
	consumeSocketRateLimit,
	maxSocketSessionsPerUser,
	socketIdleTimeoutMs,
}) {
	const terminalSessions = new Map();

	function clampTerminalColumns(value) {
		const parsed = Number(value || 120);
		return Number.isFinite(parsed) ? Math.max(40, Math.min(300, Math.floor(parsed))) : 120;
	}

	function clampTerminalRows(value) {
		const parsed = Number(value || 36);
		return Number.isFinite(parsed) ? Math.max(12, Math.min(120, Math.floor(parsed))) : 36;
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

		if (skipBackendClose) {
			return;
		}

		if (session.kind === "direct") {
			closeLocalTerminalBackend(session);
			return;
		}

		if (session.kind === "proxy") {
			await closeProxyTerminalBackend(session, requestTerminalApiWithCookie);
		}
	}

	function getSessionCount() {
		return terminalSessions.size;
	}

	function closeSocketTerminalSessions(socketId) {
		for (const [sessionId, session] of terminalSessions.entries()) {
			if (session.socketId === socketId) {
				void closeTrackedTerminalSession(sessionId);
			}
		}
	}

	async function closeAllTerminalSessions() {
		const closures = Array.from(terminalSessions.keys(), (sessionId) => closeTrackedTerminalSession(sessionId));
		await Promise.allSettled(closures);
	}

	function registerSocketHandlers({ socket, authCookie }) {
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
					const { sessionId } = await startLocalTerminalSession({
						payload,
						socket,
						authCookie,
						resolvedEnvironmentId,
						terminalSessions,
						clampTerminalColumns,
						clampTerminalRows,
						closeTrackedTerminalSession,
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
					return;
				}

				const proxyCreateResult = await startProxyTerminalSession({
					payload,
					socket,
					authCookie,
					resolvedEnvironmentId,
					terminalSessions,
					requestTerminalApi,
					clampTerminalColumns,
					clampTerminalRows,
					closeTrackedTerminalSession,
				});

				if (proxyCreateResult.error) {
					callback?.({ error: proxyCreateResult.error });
					emitRuntimeAction("terminal.create.failed", {
						userId: socket.data.userId,
						socketId: socket.id,
						containerId: payload.containerId,
						reason: "backend_create_failed",
						environmentId: resolvedEnvironmentId || null,
					});
					return;
				}

				const sessionId = proxyCreateResult.sessionId;
				callback?.({ sessionId });
				emitRuntimeAction("terminal.create.succeeded", {
					userId: socket.data.userId,
					socketId: socket.id,
					containerId: payload.containerId,
					sessionId,
					environmentId: resolvedEnvironmentId || null,
					mode: "proxy",
				});
				scheduleTerminalIdleTimeout(sessionId);
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
				writeLocalTerminalSessionInput(session, payload);
				scheduleTerminalIdleTimeout(payload.sessionId);
				return;
			}

			if (session.kind === "proxy") {
				writeProxyTerminalSessionInput(session, payload, requestTerminalApi);
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
				resizeLocalTerminalSessionWindow(session, payload, clampTerminalColumns, clampTerminalRows);
				return;
			}

			if (session.kind === "proxy") {
				resizeProxyTerminalSessionWindow(
					session,
					payload,
					requestTerminalApi,
					clampTerminalColumns,
					clampTerminalRows,
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
	}

	return {
		closeAllTerminalSessions,
		closeSocketTerminalSessions,
		getSessionCount,
		registerSocketHandlers,
	};
}
