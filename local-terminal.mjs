import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const terminalSessions = new Map();

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

const dockerBinary = resolveExecutable(process.env.DOCKER_BIN, [
	"/usr/local/bin/docker",
	"/opt/homebrew/bin/docker",
	"docker",
]);
const hostShellBinary = resolveExecutable("/bin/sh", ["/bin/sh", "/bin/bash", "/bin/zsh"]);

function buildCommand(payload) {
	const isContainer = payload?.target === "container" && payload?.containerId;

	if (isContainer) {
		return {
			file: dockerBinary,
			args: [
				"exec",
				"-i",
				payload.containerId,
				"sh",
				"-lc",
				"if command -v bash >/dev/null 2>&1; then exec bash -i; else exec sh -i; fi",
			],
			cwd: "/",
		};
	}

	return {
		file: hostShellBinary,
		args: ["-i"],
		cwd: process.cwd(),
	};
}

export function createLocalTerminalSession(payload) {
	const command = buildCommand(payload);
	const processHandle = spawn(command.file, command.args, {
		cwd: command.cwd,
		env: {
			...process.env,
			TERM: process.env.TERM || "xterm-256color",
			COLORTERM: process.env.COLORTERM || "truecolor",
		},
		stdio: "pipe",
	});

	const sessionId = globalThis.crypto.randomUUID();
	const session = {
		process: processHandle,
		events: [],
		nextCursor: 1,
		closed: false,
		exitCode: null,
	};

	const onData = (chunk) => {
		const normalized = chunk
			.toString()
			.replace(/^sh: no job control in this shell\r?\n/, "")
			.replace(/^sh: can't access tty; job control turned off\r?\n/, "");
		const cleaned = normalized
			.replace(/^bash: cannot set terminal process group \(-1\): Not a tty\r?\n/, "")
			.replace(/^bash: no job control in this shell\r?\n/, "");

		if (!cleaned) {
			return;
		}

		session.events.push({
			cursor: session.nextCursor,
			data: cleaned,
		});
		session.nextCursor += 1;
		if (session.events.length > 512) {
			session.events.shift();
		}
	};

	processHandle.stdout.on("data", onData);
	processHandle.stderr.on("data", onData);
	processHandle.on("close", (code) => {
		session.closed = true;
		session.exitCode = code ?? 0;
	});

	terminalSessions.set(sessionId, session);
	return { sessionId };
}

export function readLocalTerminalSession(sessionId, cursor = 0) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		throw new Error("Terminal session not found.");
	}

	const chunks = session.events.filter((entry) => entry.cursor > cursor).map((entry) => entry.data);
	const nextCursor = session.events.length
		? session.events[session.events.length - 1].cursor
		: Number(cursor || 0);

	return {
		chunks,
		cursor: nextCursor,
		closed: session.closed,
		exitCode: session.exitCode,
	};
}

export function writeLocalTerminalInput(sessionId, data) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		throw new Error("Terminal session not found.");
	}

	session.process.stdin.write(String(data || ""));
	return { ok: true };
}

export function resizeLocalTerminalSession(sessionId, _cols, _rows) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		throw new Error("Terminal session not found.");
	}

	return { ok: true };
}

export function closeLocalTerminalSession(sessionId) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		return { ok: true };
	}

	session.process.kill("SIGTERM");
	session.closed = true;
	setTimeout(() => {
		terminalSessions.delete(sessionId);
	}, 60_000).unref?.();
	return { ok: true };
}
