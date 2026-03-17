import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as pty from "node-pty";
import { spawn } from "node:child_process";
import { chmodSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const terminalSessions = new Map();
const supportedShells = new Set(["sh", "bash", "ash", "zsh"]);
const defaultShellOrder = ["sh", "bash", "ash", "zsh"];
const execFileAsync = promisify(execFile);
let ptyHelperPermissionsChecked = false;

/** Maximum concurrent terminal sessions across all users. */
const MAX_TOTAL_SESSIONS = 20;

/** Maximum concurrent terminal sessions per user. */
const MAX_SESSIONS_PER_USER = 5;

/** Auto-close sessions after 10 minutes of inactivity. */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Maximum events kept in the ring buffer per session. */
const MAX_EVENT_BUFFER = 512;

/** Delay before purging a closed session from the map. */
const CLOSED_SESSION_TTL_MS = 60_000;

function ensurePtySpawnHelperExecutable() {
	if (ptyHelperPermissionsChecked) {
		return;
	}
	ptyHelperPermissionsChecked = true;

	try {
		const require = createRequire(import.meta.url);
		const utils = require("node-pty/lib/utils");
		const utilsPath = require.resolve("node-pty/lib/utils");
		const native = utils?.loadNativeModule?.("pty");
		const nativeDir = native?.dir ? resolve(dirname(utilsPath), native.dir) : null;
		const helperPath = nativeDir ? resolve(nativeDir, "spawn-helper") : null;
		if (!helperPath || !existsSync(helperPath)) {
			return;
		}

		const mode = statSync(helperPath).mode & 0o777;
		if ((mode & 0o111) === 0) {
			chmodSync(helperPath, mode | 0o755);
		}
	} catch {
		// keep fallback behavior; terminal creation will use compatibility mode if PTY still fails
	}
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

const dockerBinary = resolveExecutable(process.env.DOCKER_BIN, [
	"/usr/local/bin/docker",
	"/opt/homebrew/bin/docker",
	"docker",
]);

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
		// fall back to deterministic order
	}

	return candidates[0] || "sh";
}

async function buildCommand(payload) {
	if (!payload?.containerId) {
		throw new Error("containerId is required.");
	}
	const shellCandidates = resolveShellCandidates(payload);
	const shell = await resolveContainerShell(payload.containerId, shellCandidates);

	return {
		file: dockerBinary,
		ptyArgs: ["exec", "-it", payload.containerId, shell, "-i"],
		pipeArgs: ["exec", "-i", payload.containerId, shell, "-i"],
		cwd: "/",
	};
}

function createPipeProcess(command) {
	const child = spawn(command.file, command.pipeArgs, {
		cwd: command.cwd,
		env: {
			...process.env,
			TERM: process.env.TERM || "xterm-256color",
			COLORTERM: process.env.COLORTERM || "truecolor",
		},
		stdio: ["pipe", "pipe", "pipe"],
	});

	return {
		onData(callback) {
			child.stdout?.on("data", (chunk) => callback(String(chunk || "")));
			child.stderr?.on("data", (chunk) => callback(String(chunk || "")));
		},
		onExit(callback) {
			child.on("exit", (exitCode) => {
				callback({ exitCode: exitCode ?? 0 });
			});
			child.on("error", () => {
				callback({ exitCode: 1 });
			});
		},
		write(data) {
			child.stdin?.write(String(data || "").replaceAll("\r", "\n"));
		},
		resize() {},
		kill() {
			child.kill("SIGTERM");
			setTimeout(() => {
				child.kill("SIGKILL");
			}, 1_000).unref?.();
		},
	};
}

function createTerminalProcess(command, cols, rows) {
	ensurePtySpawnHelperExecutable();

	try {
		return {
			process: pty.spawn(command.file, command.ptyArgs, {
				name: "xterm-color",
				cols,
				rows,
				cwd: command.cwd,
				env: {
					...process.env,
					TERM: process.env.TERM || "xterm-256color",
					COLORTERM: process.env.COLORTERM || "truecolor",
				},
			}),
			compatibilityMode: false,
		};
	} catch {
		return {
			process: createPipeProcess(command),
			compatibilityMode: true,
		};
	}
}

/** Count active (non-closed) sessions for a given userId. */
function countUserSessions(userId) {
	let count = 0;
	for (const session of terminalSessions.values()) {
		if (session.userId === userId && !session.closed) {
			count += 1;
		}
	}
	return count;
}

/** Count all active (non-closed) sessions. */
function countActiveSessions() {
	let count = 0;
	for (const session of terminalSessions.values()) {
		if (!session.closed) {
			count += 1;
		}
	}
	return count;
}

/** Reset the idle timeout for a session. */
function resetIdleTimeout(session) {
	if (session.idleTimer) {
		clearTimeout(session.idleTimer);
		session.idleTimer = null;
	}

	if (session.closed) {
		return;
	}

	session.idleTimer = setTimeout(() => {
		if (!session.closed) {
			session.process.kill();
			session.closed = true;
			session.exitCode = -1;
			const pendingWaiters = session.waiters.splice(0, session.waiters.length);
			for (const waiter of pendingWaiters) {
				waiter();
			}
			// Schedule cleanup from map
			setTimeout(() => {
				for (const [sessionId, s] of terminalSessions.entries()) {
					if (s === session) {
						terminalSessions.delete(sessionId);
						break;
					}
				}
			}, CLOSED_SESSION_TTL_MS).unref?.();
		}
	}, IDLE_TIMEOUT_MS);
	session.idleTimer.unref?.();
}

export async function createLocalTerminalSession(payload) {
	const userId = payload?.userId || null;

	// Enforce global session limit
	if (countActiveSessions() >= MAX_TOTAL_SESSIONS) {
		throw new Error("Maximum concurrent terminal sessions reached. Close an existing session first.");
	}

	// Enforce per-user session limit
	if (userId && countUserSessions(userId) >= MAX_SESSIONS_PER_USER) {
		throw new Error("You have too many active terminal sessions. Close an existing session first.");
	}

	const command = await buildCommand(payload);
	const cols = Math.max(40, Math.min(300, Number(payload?.cols || 120)));
	const rows = Math.max(12, Math.min(120, Number(payload?.rows || 36)));
	const { process: processHandle, compatibilityMode } = createTerminalProcess(command, cols, rows);

	// Direct streaming callbacks — when provided, PTY output is piped directly
	// to the caller (e.g. Socket.IO emit) instead of buffering in the ring buffer.
	const streamOnData = typeof payload?.onData === "function" ? payload.onData : null;
	const streamOnExit = typeof payload?.onExit === "function" ? payload.onExit : null;

	const sessionId = globalThis.crypto.randomUUID();
	const session = {
		process: processHandle,
		userId,
		events: [],
		nextCursor: 1,
		closed: false,
		exitCode: null,
		waiters: [],
		idleTimer: null,
	};

	if (compatibilityMode) {
		const msg = "Terminal is running in compatibility mode.\r\n";
		if (streamOnData) {
			streamOnData(msg);
		}
		session.events.push({
			cursor: session.nextCursor,
			data: msg,
		});
		session.nextCursor += 1;
	}

	const onData = (chunk) => {
		const data = String(chunk || "");

		// Direct streaming: emit immediately to the caller
		if (streamOnData) {
			streamOnData(data);
		}

		session.events.push({
			cursor: session.nextCursor,
			data,
		});
		session.nextCursor += 1;

		// Ring buffer: drop oldest events when exceeding limit (O(1) with splice)
		if (session.events.length > MAX_EVENT_BUFFER) {
			const excess = session.events.length - MAX_EVENT_BUFFER;
			session.events.splice(0, excess);
		}

		const pendingWaiters = session.waiters.splice(0, session.waiters.length);
		for (const waiter of pendingWaiters) {
			waiter();
		}
	};

	processHandle.onData(onData);
	processHandle.onExit(({ exitCode }) => {
		session.closed = true;
		session.exitCode = exitCode ?? 0;
		if (session.idleTimer) {
			clearTimeout(session.idleTimer);
			session.idleTimer = null;
		}

		// Direct streaming: notify caller of exit immediately
		if (streamOnExit) {
			streamOnExit({ exitCode: session.exitCode });
		}

		const pendingWaiters = session.waiters.splice(0, session.waiters.length);
		for (const waiter of pendingWaiters) {
			waiter();
		}
	});

	terminalSessions.set(sessionId, session);
	resetIdleTimeout(session);
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

export async function readLocalTerminalSessionAsync(sessionId, cursor = 0, waitMs = 0) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		throw new Error("Terminal session not found.");
	}

	const sinceCursor = Number(cursor || 0);
	if (waitMs > 0 && !session.closed) {
		const hasPendingData = session.events.some((entry) => entry.cursor > sinceCursor);
		if (!hasPendingData) {
			await new Promise((resolve) => {
				const wake = () => {
					clearTimeout(timeout);
					resolve();
				};
				session.waiters.push(wake);
				const timeout = setTimeout(() => {
					const index = session.waiters.indexOf(wake);
					if (index >= 0) {
						session.waiters.splice(index, 1);
					}
					resolve();
				}, Math.max(0, Math.min(5_000, Number(waitMs) || 0)));
				timeout.unref?.();
			});
		}
	}

	return readLocalTerminalSession(sessionId, sinceCursor);
}

export function writeLocalTerminalInput(sessionId, data) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		throw new Error("Terminal session not found.");
	}

	session.process.write(String(data || "").slice(0, 8192));
	resetIdleTimeout(session);
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
	if (session.idleTimer) {
		clearTimeout(session.idleTimer);
		session.idleTimer = null;
	}
	const pendingWaiters = session.waiters.splice(0, session.waiters.length);
	for (const waiter of pendingWaiters) {
		waiter();
	}
	setTimeout(() => {
		terminalSessions.delete(sessionId);
	}, CLOSED_SESSION_TTL_MS).unref?.();
	return { ok: true };
}

/** Verify a session belongs to the specified user. Returns true if valid. */
export function verifySessionOwnership(sessionId, userId) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		return false;
	}
	// If the session has no userId recorded (legacy), allow access
	if (!session.userId) {
		return true;
	}
	return session.userId === userId;
}
