import * as pty from "node-pty";
import { execFileAsync } from "./utils.mjs";

const terminalSessions = new Map();
const supportedShells = new Set(["sh", "bash", "ash", "zsh"]);
const defaultShellOrder = ["sh", "bash", "ash", "zsh"];

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
			"docker",
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
		// Fall back to requested ordering when probe fails.
	}

	return candidates[0] || "sh";
}

export function getTerminalSession(sessionId) {
	return terminalSessions.get(sessionId) || null;
}

export function closeTerminalSession(sessionId) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		return;
	}

	session.process.kill();
	session.closed = true;
	setTimeout(() => {
		terminalSessions.delete(sessionId);
	}, 60_000).unref?.();
}

export async function createTerminalSession(payload) {
	const sessionId = globalThis.crypto.randomUUID();
	if (payload?.target !== "container" || !payload?.containerId) {
		throw new Error("containerId is required.");
	}
	const shellCandidates = resolveShellCandidates(payload);
	const shell = await resolveContainerShell(payload.containerId, shellCandidates);
	const cols = clampTerminalColumns(payload?.cols);
	const rows = clampTerminalRows(payload?.rows);
	const child = pty.spawn("docker", ["exec", "-it", payload.containerId, shell, "-i"], {
		name: "xterm-color",
		cols,
		rows,
		cwd: "/",
		env: {
			...process.env,
			TERM: process.env.TERM || "xterm-256color",
			COLORTERM: process.env.COLORTERM || "truecolor",
		},
	});

	const session = {
		process: child,
		resize: (nextCols, nextRows) =>
			child.resize(clampTerminalColumns(nextCols), clampTerminalRows(nextRows)),
		events: [],
		nextCursor: 1,
		closed: false,
		exitCode: null,
	};

	child.onData((chunk) => {
		session.events.push({
			cursor: session.nextCursor,
			data: String(chunk || ""),
		});
		session.nextCursor += 1;
		if (session.events.length > 512) {
			session.events.shift();
		}
	});
	child.onExit(({ exitCode }) => {
		session.closed = true;
		session.exitCode = exitCode ?? 0;
	});

	terminalSessions.set(sessionId, session);

	return sessionId;
}
