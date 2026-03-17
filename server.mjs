import { randomUUID, timingSafeEqual } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
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
const runtimeActionEvents = [];
const sql = postgres(getDatabaseUrl(), { max: 5 });
const dockerBinary = resolveExecutable(process.env.DOCKER_BIN, [
	"/usr/local/bin/docker",
	"/opt/homebrew/bin/docker",
	"docker",
]);

/** Maximum concurrent socket terminal sessions per user. */
const MAX_SOCKET_SESSIONS_PER_USER = 5;

/** Maximum concurrent socket connections per user. */
const MAX_SOCKET_CONNECTIONS_PER_USER = 12;

/** Auto-close socket terminal sessions after 10 minutes of inactivity. */
const SOCKET_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Maximum in-memory runtime action events retained for diagnostics. */
const MAX_RUNTIME_ACTION_EVENTS = 200;
const LOG_SESSION_KILL_TIMEOUT_MS = 1_500;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const SOCKET_EVENT_RATE_LIMITS = {
	"terminal:create": { capacity: 4, refillPerSecond: 0.25 },
	"terminal:input": { capacity: 160, refillPerSecond: 100 },
	"terminal:resize": { capacity: 24, refillPerSecond: 12 },
	"terminal:close": { capacity: 16, refillPerSecond: 8 },
	"logs:subscribe": { capacity: 6, refillPerSecond: 0.5 },
	"logs:unsubscribe": { capacity: 12, refillPerSecond: 3 },
};

const wsRejectionCounters = {
	origin: 0,
	unauthorized: 0,
	connectionLimit: 0,
	rateLimited: 0,
};

let runtimeMetricsInterval = null;
let updateSchedulerInterval = null;
let shutdownPromise = null;
let shuttingDown = false;
let lastLocalMetricsPersistAt = 0;

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

function emitRuntimeAction(type, payload = {}) {
	const status = type.includes("failed") || type.includes("error") ? "error" : "success";
	const event = {
		id: randomUUID(),
		at: Date.now(),
		type,
		status,
		...payload,
	};
	runtimeActionEvents.push(event);
	if (runtimeActionEvents.length > MAX_RUNTIME_ACTION_EVENTS) {
		runtimeActionEvents.splice(0, runtimeActionEvents.length - MAX_RUNTIME_ACTION_EVENTS);
	}

	for (const [socketId, socket] of io.of("/").sockets) {
		if (socket.data?.role && isPrivilegedRole(socket.data.role)) {
			io.to(socketId).emit("runtime:action", event);
		}
	}

	void sql`
		insert into runtime_action_events (
			id,
			environment_id,
			actor_user_id,
			actor_role,
			source,
			action_type,
			status,
			container_id,
			session_id,
			details,
			occurred_at,
			created_at
		)
		values (
			${event.id},
			${payload.environmentId ? String(payload.environmentId) : null},
			${payload.userId ? String(payload.userId) : null},
			${payload.role ? String(payload.role) : null},
			${"socket"},
			${event.type},
			${event.status},
			${payload.containerId ? String(payload.containerId) : null},
			${payload.sessionId ? String(payload.sessionId) : null},
			${JSON.stringify(payload)},
			${new Date(event.at)},
			${new Date(event.at)}
		)
	`.catch((error) => {
		console.error(
			"[runtime] Failed to persist runtime action event:",
			error instanceof Error ? error.message : "unknown error",
		);
	});
}

/* ── Docker daemon event subscription ── */
const dockrootInitiatedActions = new Map();
let dockerEventProcess = null;
let dockerEventBackoff = 3_000;
const DOCKER_EVENT_MAX_BACKOFF = 30_000;

function registerDockrootAction(containerId, action) {
	const key = `${containerId}:${action}`;
	dockrootInitiatedActions.set(key, Date.now());
	setTimeout(() => dockrootInitiatedActions.delete(key), 5_000);
}

function isDockrootInitiated(containerId, action) {
	const key = `${containerId}:${action}`;
	return dockrootInitiatedActions.has(key);
}

function startDockerEventStream() {
	if (dockerEventProcess) {
		return;
	}

	const child = spawn(dockerBinary, [
		"events",
		"--format",
		"{{json .}}",
		"--filter",
		"type=container",
	], { stdio: ["ignore", "pipe", "pipe"] });

	dockerEventProcess = child;
	let buffer = "";

	child.stdout.on("data", (chunk) => {
		buffer += String(chunk);
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";

		for (const line of lines) {
			if (!line.trim()) {
				continue;
			}

			try {
				const event = JSON.parse(line);
				const action = event.Action || event.status || "";
				const containerId = event.Actor?.ID || event.id || "";
				const containerName = event.Actor?.Attributes?.name || "";

				if (!containerId || !["start", "stop", "die", "destroy", "kill", "pause", "unpause"].includes(action)) {
					continue;
				}

				if (isDockrootInitiated(containerId, action)) {
					continue;
				}

				io.emit("container:state", {
					containerId,
					action,
					ok: true,
					at: Date.now(),
					source: "daemon",
				});

				emitRuntimeAction(`container.external.${action}`, {
					containerId,
					containerName,
					environmentId: null,
				});
			} catch {
				// Ignore malformed JSON lines
			}
		}
	});

	child.on("close", (code) => {
		dockerEventProcess = null;
		if (!shuttingDown) {
			console.error(`[docker-events] Process exited (code=${code}), restarting in ${dockerEventBackoff}ms...`);
			setTimeout(() => {
				startDockerEventStream();
				dockerEventBackoff = Math.min(dockerEventBackoff * 2, DOCKER_EVENT_MAX_BACKOFF);
			}, dockerEventBackoff);
		}
	});

	child.on("error", (error) => {
		dockerEventProcess = null;
		console.error("[docker-events] Failed to spawn:", error.message);
	});

	// Reset backoff on successful connection (data received)
	child.stdout.once("data", () => {
		dockerEventBackoff = 3_000;
	});
}

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

function isTrustedOrigin(requestOrigin) {
	const origin = String(requestOrigin || "").trim();
	if (!origin) {
		return dev;
	}

	const configuredOrigins = getTrustedOrigins();
	if (configuredOrigins?.length) {
		return configuredOrigins.includes(origin);
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
		origin: (requestOrigin, callback) => {
			if (isTrustedOrigin(requestOrigin)) {
				callback(null, true);
				return;
			}
			callback(null, false);
		},
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
	const normalized =
		typeof environmentId === "string" && environmentId.trim() ? environmentId.trim() : "";
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
	const normalized =
		typeof environmentId === "string" && environmentId.trim() ? environmentId.trim() : "";
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
	const rule = SOCKET_EVENT_RATE_LIMITS[eventName];
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
		// Direct mode: close local PTY session directly
		try {
			closeLocalTerminalSession(session.backendSessionId);
		} catch {
			// Already cleaned up
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
			}, LOG_SESSION_KILL_TIMEOUT_MS);
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
		await persistLocalRuntimeSamples(metrics);
		const ws = getSocketRuntimeMetrics();

		for (const [socketId, socket] of io.of("/").sockets) {
			if (socket.data?.role && isPrivilegedRole(socket.data.role)) {
				io.to(socketId).emit("runtime:metrics", {
					at: Date.now(),
					containers: metrics.containers,
					host: metrics.host,
					ws,
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

function parseJsonLines(content) {
	return content
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
}

function parsePercent(value) {
	const parsed = Number.parseFloat(String(value || "").replace("%", "").trim());
	return Number.isFinite(parsed) ? parsed : null;
}

function parseHumanBytes(value) {
	const raw = String(value || "").trim();
	if (!raw) {
		return null;
	}

	const match = raw.match(/^([\d.]+)\s*([A-Za-z]+)?$/);
	if (!match) {
		return null;
	}

	const amount = Number.parseFloat(match[1]);
	if (!Number.isFinite(amount)) {
		return null;
	}

	const unit = (match[2] || "B").toUpperCase();
	const multipliers = {
		B: 1,
		KB: 1000,
		KIB: 1024,
		MB: 1000 ** 2,
		MIB: 1024 ** 2,
		GB: 1000 ** 3,
		GIB: 1024 ** 3,
		TB: 1000 ** 4,
		TIB: 1024 ** 4,
		PB: 1000 ** 5,
		PIB: 1024 ** 5,
	};
	const multiplier = multipliers[unit] || multipliers[unit.replace(/S$/, "")];
	return multiplier ? Math.round(amount * multiplier) : null;
}

function parseMemoryUsage(value) {
	const [usage, limit] = String(value || "")
		.split("/")
		.map((part) => part.trim());

	return {
		usageBytes: parseHumanBytes(usage),
		limitBytes: parseHumanBytes(limit),
	};
}

function parseNetIo(value) {
	const [rx, tx] = String(value || "")
		.split("/")
		.map((part) => part.trim());

	return {
		rxBytesTotal: parseHumanBytes(rx),
		txBytesTotal: parseHumanBytes(tx),
	};
}

function toTenths(value) {
	if (!Number.isFinite(value)) {
		return null;
	}
	return Math.round(Number(value) * 10);
}

async function getDockerRuntimeMetrics() {
	try {
		const [psResult, imagesResult, volumesResult, networksResult, statsResult, versionResult] =
			await Promise.all([
				execFileAsync(dockerBinary, ["ps", "-a", "--size", "--format", "{{json .}}"], {
					maxBuffer: 1024 * 1024 * 8,
				}),
				execFileAsync(dockerBinary, ["images", "--digests", "--format", "{{json .}}"], {
					maxBuffer: 1024 * 1024 * 8,
				}),
				execFileAsync(dockerBinary, ["volume", "ls", "--format", "{{json .}}"], {
					maxBuffer: 1024 * 1024 * 4,
				}),
				execFileAsync(dockerBinary, ["network", "ls", "--format", "{{json .}}"], {
					maxBuffer: 1024 * 1024 * 4,
				}),
				execFileAsync(dockerBinary, ["stats", "--no-stream", "--format", "{{json .}}"], {
					maxBuffer: 1024 * 1024 * 4,
				}),
				execFileAsync(dockerBinary, ["version", "--format", "{{.Server.Version}}"], {
					maxBuffer: 1024 * 256,
				}),
			]);

		const containers = parseJsonLines(psResult.stdout);
		const images = parseJsonLines(imagesResult.stdout);
		const volumes = parseJsonLines(volumesResult.stdout);
		const networks = parseJsonLines(networksResult.stdout);
		const statsRows = parseJsonLines(statsResult.stdout);
		const cpuPercent = clampPercent(
			statsRows.reduce((sum, row) => sum + (parsePercent(row.CPUPerc) || 0), 0),
		);
		const memoryPercent = clampPercent(
			statsRows.reduce((sum, row) => sum + (parsePercent(row.MemPerc) || 0), 0),
		);

		return {
			containers: statsRows,
			host: {
				source: "native",
				cpuPercent,
				memoryPercent,
				hostname: os.hostname(),
				platform: `${os.platform()} ${os.release()}`,
				architecture: os.arch(),
				dockerVersion: versionResult.stdout.trim() || "unknown",
				cpus: os.cpus().length,
				totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
				freeMemoryGb: Number((os.freemem() / 1024 / 1024 / 1024).toFixed(1)),
				counts: {
					containers: containers.length,
					runningContainers: containers.filter((row) => row.State === "running").length,
					images: images.length,
					volumes: volumes.length,
					networks: networks.length,
				},
				containerStats: statsRows,
				containerRows: containers,
			},
		};
	} catch {
		return {
			containers: [],
			host: null,
		};
	}
}

async function getRuntimeMetrics() {
	return getDockerRuntimeMetrics();
}

async function persistLocalRuntimeSamples(metrics) {
	if (!metrics?.host) {
		return;
	}

	const now = Date.now();
	if (now - lastLocalMetricsPersistAt < 15_000) {
		return;
	}
	lastLocalMetricsPersistAt = now;

	try {
		const sampledAt = new Date(now);
		const createdAt = sampledAt;
		const localEnvironments = await sql`
			select id
			from environments
			where kind = 'local'
		`;

		if (!localEnvironments.length) {
			return;
		}

		const memoryTotalBytes = Math.round((metrics.host.totalMemoryGb || 0) * 1024 * 1024 * 1024);
		const memoryUsedBytes = Math.max(
			0,
			memoryTotalBytes - Math.round((metrics.host.freeMemoryGb || 0) * 1024 * 1024 * 1024),
		);

		for (const environment of localEnvironments) {
			const sampleId = randomUUID();
			await sql`
				insert into environment_metric_samples (
					id,
					environment_id,
					source,
					hostname,
					cpu_percent_tenths,
					memory_percent_tenths,
					memory_used_bytes,
					memory_total_bytes,
					container_count,
					running_container_count,
					image_count,
					volume_count,
					network_count,
					sampled_at,
					created_at
				) values (
					${sampleId},
					${environment.id},
					${"native"},
					${metrics.host.hostname || null},
					${toTenths(metrics.host.cpuPercent)},
					${toTenths(metrics.host.memoryPercent)},
					${memoryUsedBytes || null},
					${memoryTotalBytes || null},
					${metrics.host.counts?.containers || 0},
					${metrics.host.counts?.runningContainers || 0},
					${metrics.host.counts?.images || 0},
					${metrics.host.counts?.volumes || 0},
					${metrics.host.counts?.networks || 0},
					${sampledAt},
					${createdAt}
				)
			`;

			for (const statsRow of metrics.host.containerStats || []) {
				const memory = parseMemoryUsage(statsRow.MemUsage);
				const netIo = parseNetIo(statsRow.NetIO);
				const containerName = String(statsRow.Name || statsRow.ID || "").replace(/^\//, "");
				const containerRow =
					(metrics.host.containerRows || []).find(
						(row) => row.ID === statsRow.ID || String(row.Names || "").replace(/^\//, "") === containerName,
					) || {};
				await sql`
					insert into container_metric_samples (
						id,
						environment_id,
						container_id,
						container_name,
						image,
						state,
						cpu_percent_tenths,
						memory_usage_bytes,
						memory_limit_bytes,
						memory_percent_tenths,
						rx_bytes_total,
						tx_bytes_total,
						sampled_at,
						created_at
					) values (
						${randomUUID()},
						${environment.id},
						${String(statsRow.ID || "")},
						${containerName || "unknown"},
						${String(containerRow.Image || "")},
						${String(containerRow.State || "")},
						${toTenths(parsePercent(statsRow.CPUPerc))},
						${memory.usageBytes},
						${memory.limitBytes},
						${toTenths(parsePercent(statsRow.MemPerc))},
						${netIo.rxBytesTotal},
						${netIo.txBytesTotal},
						${sampledAt},
						${createdAt}
					)
				`;
			}
		}

		const cutoff = new Date(now - 24 * 60 * 60 * 1000);
		await sql`delete from environment_metric_samples where sampled_at < ${cutoff}`;
		await sql`delete from container_metric_samples where sampled_at < ${cutoff}`;
	} catch (error) {
		console.error("[runtime:metrics] failed to persist local samples:", error?.message || error);
	}
}

await app.prepare();

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
			sendJson(res, 200, getSocketRuntimeMetrics());
			return;
		}
		if (url.pathname === "/internal/runtime-actions") {
			if (!isInternalRequestAuthorized(req)) {
				sendJson(res, 403, { error: "Forbidden" });
				return;
			}
			const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
			sendJson(res, 200, {
				events: runtimeActionEvents.slice(-limit),
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
});

globalThis.__dockroot_io = io;
globalThis.__dockroot_get_ws_metrics = getSocketRuntimeMetrics;
globalThis.__dockroot_register_action = registerDockrootAction;

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
		if (activeConnectionsForUser >= MAX_SOCKET_CONNECTIONS_PER_USER) {
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
		}, SOCKET_IDLE_TIMEOUT_MS);
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
				// ── Direct streaming for local environments ──
				// Bypass HTTP polling entirely — call local-terminal.mjs directly
				// with onData/onExit callbacks for instant Socket.IO emission.
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
				// ── HTTP proxy mode for remote/agent environments ──
				const createResult = await requestTerminalApi("/api/runtime/terminal", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
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
								await closeTrackedTerminalSession(sessionId);
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
								await closeTrackedTerminalSession(sessionId, { skipBackendClose: true });
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
			// Direct mode: write to local PTY immediately
			try {
				writeLocalTerminalInput(session.backendSessionId, String(payload.data || "").slice(0, 8192));
			} catch {
				// Session may have been closed
			}
			scheduleTerminalIdleTimeout(payload.sessionId);
		} else if (session.kind === "proxy") {
			// Proxy mode: HTTP POST to backend
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
		if (!consumeSocketRateLimit(socket, "terminal:resize")) {
			return;
		}

		const session = terminalSessions.get(payload?.sessionId);
		if (!session || session.socketId !== socket.id) {
			return;
		}

		if (session.kind === "direct") {
			// Direct mode: resize local PTY immediately
			try {
				resizeLocalTerminalSession(
					session.backendSessionId,
					clampTerminalColumns(payload?.cols),
					clampTerminalRows(payload?.rows),
				);
			} catch {
				// Session may have been closed
			}
		} else if (session.kind === "proxy") {
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
				callback?.({
					error: "No accessible containers selected for log streaming.",
				});
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
					{
						stdio: ["ignore", "pipe", "pipe"],
					},
				);

				const processEntry = {
					child,
					forceKillTimer: null,
					closed: false,
					cleanedUp: false,
					onStdout: (data) => {
						socket.emit("logs:data", {
							sessionId,
							containerId,
							chunk: data.toString(),
						});
					},
					onStderr: (data) => {
						socket.emit("logs:data", {
							sessionId,
							containerId,
							chunk: data.toString(),
						});
					},
					onClose: (code) => {
						processEntry.closed = true;
						if (processEntry.forceKillTimer) {
							clearTimeout(processEntry.forceKillTimer);
							processEntry.forceKillTimer = null;
						}
						teardownLogProcess(processEntry, "SIGKILL");
						socket.emit("logs:exit", {
							sessionId,
							containerId,
							code,
						});
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

			callback?.({
				sessionId,
			});
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

async function shutdownServer(signal) {
	if (shutdownPromise) {
		return shutdownPromise;
	}

	shuttingDown = true;
	console.log(`[shutdown] Received ${signal}; draining Dockroot runtime services...`);
	shutdownPromise = (async () => {
		if (runtimeMetricsInterval) {
			clearInterval(runtimeMetricsInterval);
			runtimeMetricsInterval = null;
		}
		if (updateSchedulerInterval) {
			clearInterval(updateSchedulerInterval);
			updateSchedulerInterval = null;
		}
		if (dockerEventProcess) {
			dockerEventProcess.kill("SIGTERM");
			dockerEventProcess = null;
		}

		const terminalClosures = Array.from(terminalSessions.keys(), (sessionId) =>
			closeTrackedTerminalSession(sessionId),
		);
		for (const sessionId of Array.from(logSessions.keys())) {
			closeTrackedLogSession(sessionId);
		}

		await Promise.allSettled(terminalClosures);

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

runtimeMetricsInterval = setInterval(emitRuntimeMetrics(), 5000);
runtimeMetricsInterval.unref?.();

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
	void tickContainerUpdateScheduler();
	startDockerEventStream();
});
