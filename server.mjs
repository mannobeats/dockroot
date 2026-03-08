import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import postgres from "postgres";
import * as pty from "node-pty";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, dir: "./apps/web", hostname, port });
const handle = app.getRequestHandler();
const execFileAsync = promisify(execFile);
const terminalSessions = new Map();
const logSessions = new Map();
const sql = postgres(process.env.DATABASE_URL, { max: 5 });

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
			"docker",
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
		const { stdout } = await execFileAsync("docker", ["stats", "--no-stream", "--format", "{{json .}}"], {
			maxBuffer: 1024 * 1024 * 4,
		});

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

const server = createServer((req, res) => handle(req, res));
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

		session.pty.kill();
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
			const cols = Number(payload?.cols || 120);
			const rows = Number(payload?.rows || 36);
			const isContainer = payload?.target === "container" && payload?.containerId;

			if (!isContainer && !isPrivilegedRole(socket.data.role)) {
				callback?.({
					error: "Host shell access is restricted to administrators.",
				});
				return;
			}

			if (
				isContainer &&
				!(await canAccessContainer(socket.data.userId, socket.data.role, payload.containerId))
			) {
				callback?.({
					error: "Container access denied.",
				});
				return;
			}

			const terminal = isContainer
				? pty.spawn(
						"docker",
						[
							"exec",
							"-it",
							payload.containerId,
							"sh",
							"-lc",
							"if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi",
						],
						{
							name: "xterm-color",
							cols,
							rows,
							cwd: "/",
							env: process.env,
						},
					)
				: pty.spawn(process.env.SHELL || "/bin/sh", [], {
						name: "xterm-color",
						cols,
						rows,
						cwd: process.cwd(),
						env: process.env,
					});

			terminalSessions.set(sessionId, {
				pty: terminal,
				socketId: socket.id,
			});

			terminal.onData((data) => {
				socket.emit("terminal:data", {
					sessionId,
					data,
				});
			});

			terminal.onExit(({ exitCode }) => {
				socket.emit("terminal:exit", {
					sessionId,
					exitCode,
				});
				terminalSessions.delete(sessionId);
			});

			callback?.({
				sessionId,
			});
		} catch (error) {
			callback?.({
				error: error instanceof Error ? error.message : "Unable to start terminal session.",
			});
		}
	});

	socket.on("terminal:input", (payload) => {
		const session = terminalSessions.get(payload?.sessionId);
		if (session?.socketId === socket.id) {
			session.pty.write(payload.data || "");
		}
	});

	socket.on("terminal:resize", (payload) => {
		const session = terminalSessions.get(payload?.sessionId);
		if (session?.socketId === socket.id) {
			session.pty.resize(Number(payload.cols || 120), Number(payload.rows || 36));
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
					"docker",
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
