import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { applyRuntimeBootstrap } from "./scripts/bootstrap-runtime.mjs";
import {
	closeLocalTerminalSession,
	createLocalTerminalSession,
	readLocalTerminalSessionAsync,
	resizeLocalTerminalSession,
	verifySessionOwnership,
	writeLocalTerminalInput,
} from "./local-terminal.mjs";
import { getDatabaseUrl } from "./scripts/database-url.mjs";
import { validateRuntimeEnv } from "./scripts/runtime-env.mjs";

await applyRuntimeBootstrap();

const { errors: envErrors, warnings: envWarnings } = validateRuntimeEnv();
if (envWarnings.length > 0) {
	for (const warning of envWarnings) {
		console.warn(`[env] ${warning}`);
	}
}

if (envErrors.length > 0) {
	throw new Error(`Invalid environment configuration:\n- ${envErrors.join("\n- ")}`);
}

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3080);
const app = next({ dev, dir: "./apps/web", hostname, port });
const handle = app.getRequestHandler();
const execFileAsync = promisify(execFile);
const terminalSessions = new Map();
const logSessions = new Map();
const sql = postgres(getDatabaseUrl(), { max: 5 });
const dockerBinary = resolveExecutable(process.env.DOCKER_BIN, [
	"/usr/local/bin/docker",
	"/opt/homebrew/bin/docker",
	"docker",
]);
const prometheusUrl = process.env.PROMETHEUS_URL || "http://localhost:9090";

/** Maximum concurrent socket terminal sessions per user. */
const MAX_SOCKET_SESSIONS_PER_USER = 5;

/** Auto-close socket terminal sessions after 10 minutes of inactivity. */
const SOCKET_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
function resolveExecutable(primaryCandidate, fallbackCandidates) {
	for (const candidate of [primaryCandidate, ...fallbackCandidates]) {
		if (!candidate) {
			continue;
		}

		if (!candidate.includes("/") || existsSync(candidate)) {
			return candidate;
		}
	}

	return fallbackCandidates[fallbackCandidates.length - 1];
}

function getTrustedOrigins() {
	const configured = [
		process.env.APP_URL,
		process.env.BETTER_AUTH_URL,
		process.env.NEXT_PUBLIC_APP_URL,
		...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
	]
		.map((origin) => origin?.trim())
		.filter(Boolean)
		.filter((origin, index, all) => all.indexOf(origin) === index);

	if (configured.length > 0) {
		return configured;
	}

	return undefined;
}

function getCorsConfig() {
	const origins = getTrustedOrigins();

	if (origins) {
		return { origin: origins, credentials: true };
	}

	return {
		origin: (requestOrigin, callback) => {
			callback(null, requestOrigin || false);
		},
		credentials: true,
	};
}

function isPrivilegedRole(role) {
	return role === "owner" || role === "admin";
}

function getAppBaseUrl() {
	return `http://127.0.0.1:${port}`;
}

function clampTerminalColumns(value) {
	const parsed = Number(value || 120);
	return Number.isFinite(parsed) ? Math.max(40, Math.min(300, Math.floor(parsed))) : 120;
}

function clampTerminalRows(value) {
	const parsed = Number(value || 36);
	return Number.isFinite(parsed) ? Math.max(12, Math.min(120, Math.floor(parsed))) : 36;
}

async function readJsonBody(req) {
	const chunks = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	if (!chunks.length) {
		return {};
	}

	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return {};
	}
}

function sendJson(res, statusCode, body) {
	res.writeHead(statusCode, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	res.end(JSON.stringify(body));
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
			["inspect", "--format", "{{ index .Config.Labels \"com.docker.compose.project\" }}", containerId],
			{
				maxBuffer: 1024 * 256,
			},
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

function emitRuntimeMetrics() {
	return async () => {
		const metrics = await getRuntimeMetrics();

		for (const [socketId, socket] of io.of("/").sockets) {
			if (socket.data?.role && isPrivilegedRole(socket.data.role)) {
				io.to(socketId).emit("runtime:metrics", {
					at: Date.now(),
					containers: metrics.containers,
					host: metrics.host,
				});
			}
		}
	};
}

function clampPercent(value) {
	if (!Number.isFinite(value)) {
		return null;
	}

	return Math.max(0, Math.min(100, Number(value)));
}

async function queryPrometheusInstant(query) {
	try {
		const response = await fetch(
			`${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`,
			{
				cache: "no-store",
			},
		);

		if (!response.ok) {
			return null;
		}

		const payload = await response.json();
		const value = payload?.data?.result?.[0]?.value?.[1];
		if (!value) {
			return null;
		}

		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

async function getPrometheusHostMetrics() {
	const [cpuPercent, memoryPercent] = await Promise.all([
		queryPrometheusInstant(
			`100 * (1 - avg(rate(node_cpu_seconds_total{job="node_exporter",mode="idle"}[2m])))`,
		),
		queryPrometheusInstant(
			`100 * (1 - (avg(node_memory_MemAvailable_bytes{job="node_exporter"}) / avg(node_memory_MemTotal_bytes{job="node_exporter"})))`,
		),
	]);

	if (cpuPercent === null && memoryPercent === null) {
		return null;
	}

	return {
		source: "prometheus",
		cpuPercent: clampPercent(cpuPercent),
		memoryPercent: clampPercent(memoryPercent),
	};
}

async function getRuntimeMetrics() {
	const [containers, host] = await Promise.all([
		getDockerRuntimeMetrics(),
		getPrometheusHostMetrics(),
	]);

	return {
		containers,
		host,
	};
}

async function getDockerRuntimeMetrics() {
	try {
		const { stdout } = await execFileAsync(
			dockerBinary,
			["stats", "--no-stream", "--format", "{{json .}}"],
			{
				maxBuffer: 1024 * 1024 * 4,
			},
		);

		return stdout
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.flatMap((line) => {
				try {
					return [JSON.parse(line)];
				} catch {
					return [];
				}
			});
	} catch {
		return [];
	}
}

await app.prepare();

const server = createServer(async (req, res) => {
	if (req.url) {
		const url = new URL(req.url, getAppBaseUrl());
		if (url.pathname === "/api/health") {
			sendJson(res, 200, { status: "ok" });
			return;
		}
		if (url.pathname === "/internal/local-terminal/sessions") {
			if (req.headers["x-dockroot-internal-token"] !== process.env.DOCKROOT_TOKEN_PEPPER) {
				sendJson(res, 403, { error: "Forbidden" });
				return;
			}

			if (req.method === "POST") {
				const payload = await readJsonBody(req);
				const userIdHeader = String(req.headers["x-dockroot-user-id"] || "").trim();
				const userId =
					typeof payload.userId === "string" && payload.userId.trim()
						? payload.userId.trim()
						: userIdHeader;
				if (!userId) {
					sendJson(res, 403, { error: "Missing terminal owner." });
					return;
				}
				sendJson(res, 200, await createLocalTerminalSession({ ...payload, userId }));
				return;
			}
		}

		const sessionMatch = url.pathname.match(/^\/internal\/local-terminal\/sessions\/([^/]+)$/);
		if (sessionMatch) {
			if (req.headers["x-dockroot-internal-token"] !== process.env.DOCKROOT_TOKEN_PEPPER) {
				sendJson(res, 403, { error: "Forbidden" });
				return;
			}

			const sessionId = decodeURIComponent(sessionMatch[1]);
			const userId = String(req.headers["x-dockroot-user-id"] || "").trim();
			if (!userId || !verifySessionOwnership(sessionId, userId)) {
				sendJson(res, 403, { error: "Forbidden" });
				return;
			}

			try {
				if (req.method === "GET") {
					sendJson(
						res,
						200,
						await readLocalTerminalSessionAsync(
							sessionId,
							Number(url.searchParams.get("cursor") || 0),
							Number(url.searchParams.get("waitMs") || 0),
						),
					);
					return;
				}

				if (req.method === "POST") {
					const payload = await readJsonBody(req);
					if (payload.type === "resize") {
						sendJson(
							res,
							200,
							resizeLocalTerminalSession(sessionId, Number(payload.cols || 120), Number(payload.rows || 36)),
						);
						return;
					}

					sendJson(res, 200, writeLocalTerminalInput(sessionId, String(payload.data || "")));
					return;
				}

				if (req.method === "DELETE") {
					sendJson(res, 200, closeLocalTerminalSession(sessionId));
					return;
				}
			} catch (error) {
				sendJson(
					res,
					error instanceof Error && error.message === "Terminal session not found." ? 404 : 500,
					{ error: error instanceof Error ? error.message : "Terminal request failed." },
				);
				return;
			}
		}
	}

	handle(req, res);
});
const io = new SocketIOServer(server, {
	path: "/socket.io",
	cors: getCorsConfig(),
});

globalThis.__dockroot_io = io;

io.use(async (socket, nextMiddleware) => {
	try {
		const auth = await getSessionFromSocket(socket);

		if (!auth) {
			nextMiddleware(new Error("Unauthorized"));
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

	async function requestTerminalApi(path, init = {}) {
		const response = await fetch(`${getAppBaseUrl()}${path}`, {
			...init,
			headers: {
				accept: "application/json",
				cookie: authCookie,
				...(init.headers || {}),
			},
			cache: "no-store",
		});
		const payload = await response.json().catch(() => ({}));
		return { ok: response.ok, payload };
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
			void closeTerminalSession(sessionId);
		}, SOCKET_IDLE_TIMEOUT_MS);
		session.idleTimer.unref?.();
	}

	async function closeTerminalSession(sessionId, options = {}) {
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

		if (session.kind === "proxy" && !skipBackendClose) {
			const environmentQuery = session.environmentId
				? `?environmentId=${encodeURIComponent(session.environmentId)}`
				: "";
			try {
				await requestTerminalApi(
					`/api/runtime/terminal/${encodeURIComponent(session.backendSessionId)}${environmentQuery}`,
					{ method: "DELETE" },
				);
			} catch {
				// Session state is already cleaned up locally; ignore backend close failures.
			}
		}
	}

	function closeLogSession(sessionId) {
		const session = logSessions.get(sessionId);
		if (!session) {
			return;
		}

		for (const process of session.processes) {
			process.kill("SIGTERM");
		}
		logSessions.delete(sessionId);
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
			if (!payload?.containerId) {
				callback?.({ error: "containerId is required." });
				return;
			}

			// Enforce per-user socket session limit
			let userSessionCount = 0;
			for (const session of terminalSessions.values()) {
				if (session.socketId === socket.id || (session.userId && session.userId === socket.data.userId)) {
					userSessionCount += 1;
				}
			}
			if (userSessionCount >= MAX_SOCKET_SESSIONS_PER_USER) {
				callback?.({
					error: "Too many active terminal sessions. Close an existing session first.",
				});
				return;
			}

			const createResult = await requestTerminalApi("/api/runtime/terminal", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					target: "container",
					containerId: payload.containerId,
					environmentId: payload.environmentId,
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
				return;
			}

			const sessionId = randomUUID();
			const pollAbort = new AbortController();
			terminalSessions.set(sessionId, {
				kind: "proxy",
				backendSessionId,
				environmentId:
					typeof payload?.environmentId === "string" && payload.environmentId.trim()
						? payload.environmentId.trim()
						: "",
				socketId: socket.id,
				userId: socket.data.userId,
				idleTimer: null,
				pollAbort,
				cursor: 0,
				writeQueue: Promise.resolve(),
			});

			callback?.({ sessionId });

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
							{
								signal: pollAbort.signal,
							},
						);

						if (pollAbort.signal.aborted) {
							return;
						}
						if (!readResult.ok) {
							socket.emit("terminal:exit", {
								sessionId,
								exitCode: -2,
							});
							await closeTerminalSession(sessionId);
							return;
						}

						const chunks = Array.isArray(readResult.payload?.chunks)
							? readResult.payload.chunks
							: [];
						for (const chunk of chunks) {
							socket.emit("terminal:data", {
								sessionId,
								data: String(chunk || ""),
							});
						}
						session.cursor = Number(readResult.payload?.cursor || session.cursor || 0);

						if (readResult.payload?.closed) {
							socket.emit("terminal:exit", {
								sessionId,
								exitCode: Number(readResult.payload?.exitCode ?? 0),
							});
							await closeTerminalSession(sessionId, { skipBackendClose: true });
							return;
						}
					}
				} catch {
					if (pollAbort.signal.aborted) {
						return;
					}
					socket.emit("terminal:exit", {
						sessionId,
						exitCode: -2,
					});
					await closeTerminalSession(sessionId);
				}
			};

			void poll();
			scheduleTerminalIdleTimeout(sessionId);
		} catch (error) {
			callback?.({
				error: error instanceof Error ? error.message : "Unable to start terminal session.",
			});
		}
	});

	socket.on("terminal:input", (payload) => {
		const session = terminalSessions.get(payload?.sessionId);
		if (
			session?.socketId === socket.id &&
			session.kind === "proxy" &&
			typeof payload?.data === "string"
		) {
			const environmentQuery = session.environmentId
				? `?environmentId=${encodeURIComponent(session.environmentId)}`
				: "";
			session.writeQueue = session.writeQueue
				.then(() =>
					requestTerminalApi(
						`/api/runtime/terminal/${encodeURIComponent(session.backendSessionId)}${environmentQuery}`,
						{
							method: "POST",
							headers: {
								"content-type": "application/json",
							},
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
		const session = terminalSessions.get(payload?.sessionId);
		if (session?.socketId === socket.id && session.kind === "proxy") {
			const environmentQuery = session.environmentId
				? `?environmentId=${encodeURIComponent(session.environmentId)}`
				: "";
			void requestTerminalApi(
				`/api/runtime/terminal/${encodeURIComponent(session.backendSessionId)}${environmentQuery}`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
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
		const session = terminalSessions.get(payload?.sessionId);
		if (session?.socketId === socket.id) {
			void closeTerminalSession(payload.sessionId);
		}
	});

	socket.on("logs:subscribe", async (payload, callback) => {
		try {
			const sessionId = payload?.sessionId || randomUUID();
			closeLogSession(sessionId);

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
				callback?.({
					error: "No accessible containers selected for log streaming.",
				});
				return;
			}
			const processes = allowedContainerIds.map((containerId) => {
				const child = spawn(
					dockerBinary,
					["logs", "-f", "--tail", String(payload?.tail || 150), "--timestamps", containerId],
					{
						stdio: ["ignore", "pipe", "pipe"],
					},
				);

				const forward = (data) => {
					socket.emit("logs:data", {
						sessionId,
						containerId,
						chunk: data.toString(),
					});
				};

				child.stdout.on("data", forward);
				child.stderr.on("data", forward);
				child.on("close", (code) => {
					socket.emit("logs:exit", {
						sessionId,
						containerId,
						code,
					});
				});

				return child;
			});

			logSessions.set(sessionId, {
				processes,
				socketId: socket.id,
			});

			callback?.({
				sessionId,
			});
		} catch (error) {
			callback?.({
				error: error instanceof Error ? error.message : "Unable to start log stream.",
			});
		}
	});

	socket.on("logs:unsubscribe", (payload) => {
		const session = logSessions.get(payload?.sessionId);
		if (session?.socketId === socket.id) {
			closeLogSession(payload.sessionId);
		}
	});

	socket.on("disconnect", () => {
		for (const [sessionId, session] of terminalSessions.entries()) {
			if (session.socketId === socket.id) {
				void closeTerminalSession(sessionId);
			}
		}

		for (const [sessionId, session] of logSessions.entries()) {
			if (session.socketId === socket.id) {
				closeLogSession(sessionId);
			}
		}
	});
});

setInterval(emitRuntimeMetrics(), 5000);

const updateSchedulerWorkerId = `dockroot-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

async function tickContainerUpdateScheduler() {
	if (!process.env.DOCKROOT_TOKEN_PEPPER) {
		return;
	}

	try {
		await fetch(`${getAppBaseUrl()}/api/internal/updates/tick`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-dockroot-internal-token": process.env.DOCKROOT_TOKEN_PEPPER,
			},
			body: JSON.stringify({
				workerId: updateSchedulerWorkerId,
				maxSchedules: 3,
			}),
		});
	} catch (error) {
		console.error(
			"[updates:scheduler] tick failed:",
			error instanceof Error ? error.message : "unknown error",
		);
	}
}

setInterval(() => {
	void tickContainerUpdateScheduler();
}, 30_000).unref?.();

server.listen(port, hostname, () => {
	console.log(`> Ready on http://${hostname}:${port}`);
	void tickContainerUpdateScheduler();
});
