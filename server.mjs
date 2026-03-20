import { timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { promisify } from "node:util";
import postgres from "postgres";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import msgpackParser from "socket.io-msgpack-parser";
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
import { createRuntimeActionJournal } from "./server/runtime/runtime-actions.mjs";
import { createDockerEventService } from "./server/runtime/docker-events.mjs";
import { createRuntimeMetricsService } from "./server/runtime/runtime-metrics.mjs";
import { createAgentSocketRuntime } from "./server/socket/agent-runtime.mjs";
import { getMetricsRoom } from "./server/socket/metrics-room.mjs";
import { createSocketRuntimeService } from "./server/socket/socket-runtime.mjs";

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
const app = /** @type {any} */ (next)({ dev, dir: "./apps/web", hostname, port });
const handle = app.getRequestHandler();
const execFileAsync = promisify(execFile);
const sql = postgres(getDatabaseUrl(), { max: 5 });
const dockerBinary = resolveExecutable(process.env.DOCKER_BIN, [
	"/usr/local/bin/docker",
	"/opt/homebrew/bin/docker",
	"docker",
]);

const MAX_SOCKET_SESSIONS_PER_USER = 5;
const MAX_SOCKET_CONNECTIONS_PER_USER = 12;
const SOCKET_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RUNTIME_ACTION_EVENTS = 200;
const LOG_SESSION_KILL_TIMEOUT_MS = 1_500;
const SHUTDOWN_TIMEOUT_MS = 10_000;

let runtimeMetricsInterval = null;
let runtimeMetricsPersistInterval = null;
let updateSchedulerInterval = null;
let shutdownPromise = null;
let shuttingDown = false;

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
		.map((origin) => normalizeOrigin(origin))
		.filter(Boolean)
		.filter((origin, index, all) => all.indexOf(origin) === index);

	if (configured.length > 0) {
		return configured;
	}

	return undefined;
}

function normalizeOrigin(value) {
	const input = String(value || "").trim();
	if (!input) {
		return "";
	}

	try {
		return new URL(input).origin;
	} catch {
		return "";
	}
}

function readHeaderValues(headers, name) {
	const raw = headers?.[name];
	if (Array.isArray(raw)) {
		return raw.flatMap((value) => String(value || "").split(",")).map((value) => value.trim()).filter(Boolean);
	}

	return String(raw || "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

function getHeaderOriginCandidates(requestHeaders, defaultProtocol = "http:") {
	const hosts = [
		...readHeaderValues(requestHeaders, "x-forwarded-host"),
		...readHeaderValues(requestHeaders, "host"),
	];
	if (hosts.length === 0) {
		return [];
	}

	const protocolHints = new Set(
		readHeaderValues(requestHeaders, "x-forwarded-proto")
			.map((value) => value.replace(/:$/u, "").toLowerCase())
			.filter(Boolean),
	);
	const fallbackProtocol = String(defaultProtocol || "http:").replace(/:$/u, "").toLowerCase();
	if (fallbackProtocol) {
		protocolHints.add(fallbackProtocol);
	}

	const candidates = [];
	for (const host of hosts) {
		for (const protocol of protocolHints) {
			candidates.push(normalizeOrigin(`${protocol}://${host}`));
		}
	}

	return candidates.filter(Boolean).filter((origin, index, all) => all.indexOf(origin) === index);
}

function isTrustedOrigin(requestOrigin, requestHeaders = undefined) {
	const origin = normalizeOrigin(requestOrigin);
	if (!origin) {
		return dev;
	}

	const configuredOrigins = getTrustedOrigins();
	if (configuredOrigins?.length) {
		if (configuredOrigins.includes(origin)) {
			return true;
		}
	}

	const headerOrigins = getHeaderOriginCandidates(requestHeaders, new URL(origin).protocol);
	if (headerOrigins.includes(origin)) {
		return true;
	}

	if (!dev) {
		return false;
	}

	return (
		origin === `http://localhost:${port}` ||
		origin === `http://127.0.0.1:${port}` ||
		origin === "http://localhost:3000" ||
		origin === "http://127.0.0.1:3000"
	);
}

function getCorsConfig() {
	return {
		origin: true,
		credentials: true,
	};
}

function isPrivilegedRole(role) {
	return role === "owner" || role === "admin";
}

function compareInternalToken(candidate) {
	const expected = String(process.env.DOCKROOT_TOKEN_PEPPER || "");
	const received = String(candidate || "");
	if (!expected || !received) {
		return false;
	}
	const expectedBuffer = Buffer.from(expected, "utf8");
	const receivedBuffer = Buffer.from(received, "utf8");
	if (expectedBuffer.length !== receivedBuffer.length) {
		return false;
	}
	return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function isInternalRequestAuthorized(req) {
	return compareInternalToken(req.headers["x-dockroot-internal-token"]);
}

function getAppBaseUrl() {
	return `http://127.0.0.1:${port}`;
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

function withTimeout(promise, timeoutMs, label) {
	let timeoutId = null;
	const timeoutPromise = new Promise((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
		}, timeoutMs);
		timeoutId.unref?.();
	});

	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	});
}

await app.prepare();

let runtimeActionJournal = null;
let socketRuntimeService = null;

const server = createServer(async (req, res) => {
	if (shuttingDown && req.url !== "/api/health") {
		sendJson(res, 503, { error: "Server is shutting down." });
		return;
	}

	if (req.url) {
		const url = new URL(req.url, getAppBaseUrl());
		if (url.pathname === "/api/health") {
			sendJson(res, 200, { status: "ok" });
			return;
		}

		if (url.pathname === "/internal/ws-metrics") {
			if (!isInternalRequestAuthorized(req)) {
				sendJson(res, 403, { error: "Forbidden" });
				return;
			}
			sendJson(res, 200, socketRuntimeService?.getSocketRuntimeMetrics?.() || {});
			return;
		}

		if (url.pathname === "/internal/runtime-actions") {
			if (!isInternalRequestAuthorized(req)) {
				sendJson(res, 403, { error: "Forbidden" });
				return;
			}
			const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
			sendJson(res, 200, {
				events: runtimeActionJournal?.listRuntimeActionEvents?.(limit) || [],
			});
			return;
		}

		if (url.pathname === "/internal/local-terminal/sessions") {
			if (!isInternalRequestAuthorized(req)) {
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
			if (!isInternalRequestAuthorized(req)) {
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
	parser: msgpackParser,
});

runtimeActionJournal = createRuntimeActionJournal({
	io,
	sql,
	isPrivilegedRole,
	maxEvents: MAX_RUNTIME_ACTION_EVENTS,
});

const runtimeMetricsService = createRuntimeMetricsService({
	io,
	sql,
	dockerBinary,
	execFileAsync,
	isPrivilegedRole,
	getSocketRuntimeMetrics: () => socketRuntimeService?.getSocketRuntimeMetrics?.() || {},
	isShuttingDown: () => shuttingDown,
});

socketRuntimeService = createSocketRuntimeService({
	io,
	sql,
	dockerBinary,
	execFileAsync,
	getAppBaseUrl,
	isPrivilegedRole,
	isTrustedOrigin,
	emitRuntimeAction: runtimeActionJournal.emitRuntimeAction,
	metricsSubscriptionCallbacks: {
		getSubscriptionKey: (input) => {
			if (typeof input === "string") {
				const normalized = input.trim();
				return normalized ? `legacy:${normalized}` : "";
			}
			const environmentId =
				typeof input?.environmentId === "string" ? input.environmentId.trim() : "";
			const environmentKind = input?.environmentKind === "agent" ? "agent" : "local";
			return environmentId ? `${environmentKind}:${environmentId}` : "";
		},
		addSubscriber: async ({ socket, userId, input }) => {
			if (
				(typeof input === "string" && input.trim() === "local") ||
				(input?.environmentKind !== "agent" && String(input?.environmentId || "").trim() === "local")
			) {
				runtimeMetricsService.addMetricsSubscriber(socket);
				return {
					subscriptionKey:
						typeof input === "string" ? "legacy:local" : "local:local",
					environmentKey: "local",
					environmentKind: "local",
				};
			}

			const environmentId =
				typeof input?.environmentId === "string" ? input.environmentId.trim() : "";
			if (!environmentId) {
				return null;
			}

			const ownedEnvironment = await socketRuntimeService.accessControl?.resolveOwnedEnvironmentWithKind?.(
				userId,
				environmentId,
			);
			if (!ownedEnvironment?.id) {
				return null;
			}

			if (ownedEnvironment.kind === "local") {
				runtimeMetricsService.addMetricsSubscriber(socket);
				return {
					subscriptionKey: `local:${ownedEnvironment.id}`,
					environmentKey: "local",
					environmentKind: "local",
				};
			}

			const room = getMetricsRoom(ownedEnvironment.id);
			socket.join(room);
			agentSocketRuntime.addEnvironmentSubscriber(ownedEnvironment.id);
			return {
				subscriptionKey: `agent:${ownedEnvironment.id}`,
				environmentKey: ownedEnvironment.id,
				environmentKind: "agent",
				room,
			};
		},
		removeSubscriber: async ({ socket, subscription }) => {
			if (!subscription) {
				return;
			}
			if (subscription.environmentKind === "local") {
				runtimeMetricsService.removeMetricsSubscriber(socket);
				return;
			}
			if (subscription.room) {
				socket.leave(subscription.room);
			}
			if (subscription.environmentKey) {
				agentSocketRuntime.removeEnvironmentSubscriber(subscription.environmentKey);
			}
		},
	},
	maxSocketSessionsPerUser: MAX_SOCKET_SESSIONS_PER_USER,
	maxSocketConnectionsPerUser: MAX_SOCKET_CONNECTIONS_PER_USER,
	socketIdleTimeoutMs: SOCKET_IDLE_TIMEOUT_MS,
	logSessionKillTimeoutMs: LOG_SESSION_KILL_TIMEOUT_MS,
});
socketRuntimeService.attach();

const dockerEventService = createDockerEventService({
	io,
	dockerBinary,
	emitRuntimeAction: runtimeActionJournal.emitRuntimeAction,
	isShuttingDown: () => shuttingDown,
});

const agentSocketRuntime = createAgentSocketRuntime({
	io,
	sql,
	isShuttingDown: () => shuttingDown,
	persistRuntimeSnapshotMetrics: async (input) => {
		// Lazy import to use the Next.js server-side module
		try {
			const response = await fetch(`${getAppBaseUrl()}/api/internal/agent-metrics`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-dockroot-internal-token": process.env.DOCKROOT_TOKEN_PEPPER || "",
				},
				body: JSON.stringify(input),
			});
			if (!response.ok) {
				console.error("[agent:ws] Failed to persist agent metrics via API:", response.status);
			}
		} catch (error) {
			console.error("[agent:ws] Agent metrics persistence error:", error?.message);
		}
	},
});
agentSocketRuntime.attach();

globalThis.__dockroot_io = io;
globalThis.__dockroot_agent_socket_runtime = agentSocketRuntime;
globalThis.__dockroot_get_ws_metrics = () => socketRuntimeService.getSocketRuntimeMetrics();
globalThis.__dockroot_register_action = dockerEventService.registerDockrootAction;
globalThis.__dockroot_get_runtime_snapshot = (environmentId, maxAgeMs) => {
	const normalizedEnvironmentId = String(environmentId || "").trim();
	if (!normalizedEnvironmentId) {
		return null;
	}
	if (normalizedEnvironmentId === "local") {
		return runtimeMetricsService.getLatestRuntimeSnapshot(maxAgeMs);
	}
	return agentSocketRuntime.getLatestSnapshot(normalizedEnvironmentId, maxAgeMs);
};
globalThis.__dockroot_set_runtime_snapshot = (environmentId, snapshot, sampledAt = Date.now()) => {
	const normalizedEnvironmentId = String(environmentId || "").trim();
	if (!normalizedEnvironmentId || !snapshot) {
		return;
	}
	if (normalizedEnvironmentId === "local") {
		runtimeMetricsService.setLatestRuntimeSnapshot?.(snapshot, sampledAt);
		return;
	}
	agentSocketRuntime.cacheSnapshot(normalizedEnvironmentId, snapshot, sampledAt);
};

async function shutdownServer(signal) {
	if (shutdownPromise) {
		return shutdownPromise;
	}

	shuttingDown = true;
	console.log(`[shutdown] Received ${signal}; draining Dockroot runtime services...`);
	shutdownPromise = (async () => {
		runtimeMetricsService.stopDockerStatsStream();
		if (runtimeMetricsInterval) {
			clearInterval(runtimeMetricsInterval);
			runtimeMetricsInterval = null;
		}
		if (runtimeMetricsPersistInterval) {
			clearInterval(runtimeMetricsPersistInterval);
			runtimeMetricsPersistInterval = null;
		}
		if (updateSchedulerInterval) {
			clearInterval(updateSchedulerInterval);
			updateSchedulerInterval = null;
		}
		dockerEventService.stopDockerEventStream();

		await socketRuntimeService.closeAllSessions();

		await withTimeout(
			new Promise((resolveClose) => {
				io.close(() => resolveClose());
			}),
			SHUTDOWN_TIMEOUT_MS,
			"Socket.IO shutdown",
		);
		await withTimeout(
			new Promise((resolveClose) => {
				server.close(() => resolveClose());
			}),
			SHUTDOWN_TIMEOUT_MS,
			"HTTP server shutdown",
		);

		try {
			await withTimeout(sql.end({ timeout: 5 }), SHUTDOWN_TIMEOUT_MS, "Database shutdown");
		} catch (error) {
			console.error(
				"[shutdown] Failed to close database pool cleanly:",
				error instanceof Error ? error.message : "unknown error",
			);
		}
		console.log("[shutdown] Dockroot shutdown complete.");
	})();

	return shutdownPromise;
}

runtimeMetricsService.startDockerStatsStream();
runtimeMetricsInterval = setInterval(
	() => void runtimeMetricsService.refreshResourceCounts(),
	runtimeMetricsService.resourceCountsIntervalMs,
);
runtimeMetricsInterval.unref?.();
runtimeMetricsPersistInterval = setInterval(
	() => void runtimeMetricsService.persistCurrentMetrics(),
	runtimeMetricsService.localSampleIntervalMs,
);
runtimeMetricsPersistInterval.unref?.();

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

updateSchedulerInterval = setInterval(() => {
	void tickContainerUpdateScheduler();
}, 30_000);
updateSchedulerInterval.unref?.();

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.once(signal, () => {
		void shutdownServer(signal)
			.then(() => {
				process.exit(0);
			})
			.catch((error) => {
				console.error(
					`[shutdown] Failed while handling ${signal}:`,
					error instanceof Error ? error.message : "unknown error",
				);
				process.exit(1);
			});
	});
}

server.listen(port, hostname, () => {
	console.log(`> Ready on http://${hostname}:${port}`);
	void runtimeMetricsService.persistCurrentMetrics();
	void tickContainerUpdateScheduler();
	dockerEventService.startDockerEventStream();
});
