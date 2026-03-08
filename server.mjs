import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
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
		origin: true,
		credentials: true,
	},
});

globalThis.__dockroot_io = io;

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

	socket.on("room:join", (room) => {
		if (typeof room === "string" && room.length > 0) {
			socket.join(room);
		}
	});

	socket.on("room:leave", (room) => {
		if (typeof room === "string" && room.length > 0) {
			socket.leave(room);
		}
	});

	socket.on("terminal:create", (payload, callback) => {
		try {
			const sessionId = crypto.randomUUID();
			const cols = Number(payload?.cols || 120);
			const rows = Number(payload?.rows || 36);
			const isContainer = payload?.target === "container" && payload?.containerId;

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

	socket.on("logs:subscribe", (payload, callback) => {
		try {
			const sessionId = payload?.sessionId || crypto.randomUUID();
			closeLogSession(sessionId);

			const containerIds = Array.isArray(payload?.containerIds)
				? payload.containerIds.filter((value) => typeof value === "string" && value.length > 0)
				: [];
			const processes = containerIds.map((containerId) => {
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

setInterval(async () => {
	const metrics = await getRuntimeMetrics();
	io.emit("runtime:metrics", {
		at: Date.now(),
		containers: metrics,
	});
}, 5000);

server.listen(port, hostname, () => {
	console.log(`> Ready on http://${hostname}:${port}`);
});
