import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { promisify } from "node:util";
import postgres from "postgres";
import * as pty from "node-pty";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import {
	closeLocalTerminalSession,
	createLocalTerminalSession,
	readLocalTerminalSession,
	resizeLocalTerminalSession,
	writeLocalTerminalInput,
} from "./local-terminal.mjs";
import { getDatabaseUrl } from "./scripts/database-url.mjs";
import { validateRuntimeEnv } from "./scripts/runtime-env.mjs";

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
const supportedShells = new Set(["sh", "bash", "ash", "zsh"]);
const defaultShellOrder = ["sh", "bash", "ash", "zsh"];
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
	return [
		process.env.BETTER_AUTH_URL,
		process.env.NEXT_PUBLIC_APP_URL,
		...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
	]
		.map((origin) => origin?.trim())
		.filter(Boolean)
		.filter((origin, index, all) => all.indexOf(origin) === index);
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

function isSafeCustomShell(value) {
	return typeof value === "string" && /^[A-Za-z0-9_./-]{1,120}$/.test(value);
}

function escapeSingleQuotes(value) {
	return value.replaceAll("'", "'\"'\"'");
}

function resolveShellCandidates(payload) {
	const requestedShell =
		typeof payload?.shell === "string" ? payload.shell.trim().toLowerCase() : defaultShellOrder[0];
	const customShell = typeof payload?.customShell === "string" ? payload.customShell.trim() : "";
	if (requestedShell === "custom" && !isSafeCustomShell(customShell)) {
		throw new Error("Invalid custom shell.");
	}

	const candidates = [];
	if (requestedShell === "custom" && customShell) {
		candidates.push(customShell);
	}
	if (supportedShells.has(requestedShell)) {
		candidates.push(requestedShell);
	}
	for (const candidate of defaultShellOrder) {
		candidates.push(candidate);
	}

	return Array.from(new Set(candidates));
}

function buildShellProbeScript(candidates) {
	const tokens = candidates.map((candidate) => `'${escapeSingleQuotes(candidate)}'`).join(" ");
	return `for shell_bin in ${tokens}; do if command -v "$shell_bin" >/dev/null 2>&1; then printf "%s" "$shell_bin"; exit 0; fi; done; exit 127`;
}

async function resolveContainerShell(containerId, candidates) {
	try {
		const probe = await execFileAsync(
			dockerBinary,
			["exec", containerId, "sh", "-lc", buildShellProbeScript(candidates)],
			{
				maxBuffer: 1024 * 64,
			},
		);
		const resolved = probe.stdout.trim();
		if (resolved) {
			return resolved;
		}
	} catch {
		// Fall through to first viable candidate.
	}

	return candidates[0] || "sh";
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
					containers: metrics,
				});
			}
		}
	};
}

async function getRuntimeMetrics() {
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
		if (url.pathname === "/internal/local-terminal/sessions") {
			if (req.headers["x-dockroot-internal-token"] !== process.env.DOCKROOT_TOKEN_PEPPER) {
				sendJson(res, 403, { error: "Forbidden" });
				return;
			}

			if (req.method === "POST") {
				const payload = await readJsonBody(req);
				sendJson(res, 200, await createLocalTerminalSession(payload));
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

			try {
				if (req.method === "GET") {
					sendJson(res, 200, readLocalTerminalSession(sessionId, Number(url.searchParams.get("cursor") || 0)));
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
	cors: {
		origin: getTrustedOrigins(),
		credentials: true,
	},
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
	function closeTerminalSession(sessionId) {
		const session = terminalSessions.get(sessionId);
		if (!session) {
			return;
		}

		session.kill();
		terminalSessions.delete(sessionId);
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
			const sessionId = randomUUID();
			const cols = clampTerminalColumns(payload?.cols);
			const rows = clampTerminalRows(payload?.rows);

			if (
				!payload?.containerId ||
				!(await canAccessContainer(socket.data.userId, socket.data.role, payload.containerId))
			) {
				callback?.({
					error: "Container access denied.",
				});
				return;
			}
			const shellCandidates = resolveShellCandidates(payload);
			const shell = await resolveContainerShell(payload.containerId, shellCandidates);

			const command = {
				file: dockerBinary,
				args: ["exec", "-it", payload.containerId, shell, "-i"],
				cwd: "/",
			};

			const ptyProcess = pty.spawn(command.file, command.args, {
				name: "xterm-color",
				cols,
				rows,
				cwd: command.cwd,
				env: {
					...process.env,
					TERM: process.env.TERM || "xterm-256color",
					COLORTERM: process.env.COLORTERM || "truecolor",
				},
			});

			const terminalSession = {
				kind: "pty",
				write: (data) => ptyProcess.write(data),
				resize: (nextCols, nextRows) =>
					ptyProcess.resize(clampTerminalColumns(nextCols), clampTerminalRows(nextRows)),
				kill: () => ptyProcess.kill(),
				onData: (listener) => ptyProcess.onData(listener),
				onExit: (listener) => ptyProcess.onExit(listener),
			};

			terminalSessions.set(sessionId, {
				...terminalSession,
				socketId: socket.id,
			});

			let handshakeComplete = false;
			const initialOutput = [];
			terminalSession.onData((data) => {
				if (!handshakeComplete) {
					initialOutput.push(data);
					return;
				}

				socket.emit("terminal:data", {
					sessionId,
					data,
				});
			});

			terminalSession.onExit(({ exitCode }) => {
				socket.emit("terminal:exit", {
					sessionId,
					exitCode,
				});
				terminalSessions.delete(sessionId);
			});

			await new Promise((resolve) => {
				setTimeout(resolve, 75);
			});
			handshakeComplete = true;

			callback?.({
				sessionId,
				initialData: initialOutput.join(""),
			});
		} catch (error) {
			callback?.({
				error: error instanceof Error ? error.message : "Unable to start terminal session.",
			});
		}
	});

	socket.on("terminal:input", (payload) => {
		const session = terminalSessions.get(payload?.sessionId);
		if (session?.socketId === socket.id && typeof payload?.data === "string") {
			session.write(payload.data.slice(0, 8192));
		}
	});

	socket.on("terminal:resize", (payload) => {
		const session = terminalSessions.get(payload?.sessionId);
		if (session?.socketId === socket.id && session.resize) {
			session.resize(clampTerminalColumns(payload.cols), clampTerminalRows(payload.rows));
		}
	});

	socket.on("terminal:close", (payload) => {
		const session = terminalSessions.get(payload?.sessionId);
		if (session?.socketId === socket.id) {
			closeTerminalSession(payload.sessionId);
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
				closeTerminalSession(sessionId);
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

server.listen(port, hostname, () => {
	console.log(`> Ready on http://${hostname}:${port}`);
});
