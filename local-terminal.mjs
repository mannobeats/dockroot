import { existsSync } from "node:fs";
import * as pty from "node-pty";

const terminalSessions = new Map();
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

const dockerBinary = resolveExecutable(process.env.DOCKER_BIN, [
	"/usr/local/bin/docker",
	"/opt/homebrew/bin/docker",
	"docker",
]);

function escapeSingleQuotes(value) {
	return value.replaceAll("'", "'\"'\"'");
}

function isSafeCustomShell(value) {
	return typeof value === "string" && /^[A-Za-z0-9_./-]{1,120}$/.test(value);
}

function resolveShellCandidates(payload) {
	const requestedShell =
		typeof payload?.shell === "string" ? payload.shell.trim().toLowerCase() : defaultShellOrder[0];
	const customShell = typeof payload?.customShell === "string" ? payload.customShell.trim() : "";
	if (requestedShell === "custom" && !isSafeCustomShell(customShell)) {
		throw new Error("Invalid custom shell. Use only letters, numbers, ., /, _, and -.");
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

function buildShellBootstrapScript(candidates) {
	const tokens = candidates.map((candidate) => `'${escapeSingleQuotes(candidate)}'`).join(" ");
	return `for shell_bin in ${tokens}; do if command -v "$shell_bin" >/dev/null 2>&1; then exec "$shell_bin" -i; fi; done; echo "No supported shell found." >&2; exit 127`;
}

function buildCommand(payload) {
	if (!payload?.containerId) {
		throw new Error("containerId is required.");
	}
	const shellCandidates = resolveShellCandidates(payload);
	const script = buildShellBootstrapScript(shellCandidates);

	return {
		file: dockerBinary,
		args: [
			"exec",
			"-it",
			payload.containerId,
			"sh",
			"-lc",
			script,
		],
		cwd: "/",
	};
}

export function createLocalTerminalSession(payload) {
	const command = buildCommand(payload);
	const cols = Math.max(40, Math.min(300, Number(payload?.cols || 120)));
	const rows = Math.max(12, Math.min(120, Number(payload?.rows || 36)));
	const processHandle = pty.spawn(command.file, command.args, {
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

	const sessionId = globalThis.crypto.randomUUID();
	const session = {
		process: processHandle,
		events: [],
		nextCursor: 1,
		closed: false,
		exitCode: null,
	};

	const onData = (chunk) => {
		session.events.push({
			cursor: session.nextCursor,
			data: String(chunk || ""),
		});
		session.nextCursor += 1;
		if (session.events.length > 512) {
			session.events.shift();
		}
	};

	processHandle.onData(onData);
	processHandle.onExit(({ exitCode }) => {
		session.closed = true;
		session.exitCode = exitCode ?? 0;
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

	session.process.write(String(data || "").slice(0, 8192));
	return { ok: true };
}

export function resizeLocalTerminalSession(sessionId, cols, rows) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		throw new Error("Terminal session not found.");
	}
	session.process.resize(
		Math.max(40, Math.min(300, Number(cols || 120))),
		Math.max(12, Math.min(120, Number(rows || 36))),
	);

	return { ok: true };
}

export function closeLocalTerminalSession(sessionId) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		return { ok: true };
	}

	session.process.kill();
	session.closed = true;
	setTimeout(() => {
		terminalSessions.delete(sessionId);
	}, 60_000).unref?.();
	return { ok: true };
}
