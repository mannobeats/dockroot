import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, dir: "./apps/web", hostname, port });
const handle = app.getRequestHandler();
const execFileAsync = promisify(execFile);

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
