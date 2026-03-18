import { randomUUID } from "node:crypto";
import {
	closeLocalTerminalSession,
	createLocalTerminalSession,
	resizeLocalTerminalSession,
	writeLocalTerminalInput,
} from "../../local-terminal.mjs";

export async function startLocalTerminalSession({
	payload,
	socket,
	authCookie,
	resolvedEnvironmentId,
	terminalSessions,
	clampTerminalColumns,
	clampTerminalRows,
	closeTrackedTerminalSession,
}) {
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

	return { sessionId };
}

export function writeLocalTerminalSessionInput(session, payload) {
	try {
		writeLocalTerminalInput(session.backendSessionId, String(payload.data || "").slice(0, 8192));
	} catch {
		// Session may have been closed.
	}
}

export function resizeLocalTerminalSessionWindow(session, payload, clampTerminalColumns, clampTerminalRows) {
	try {
		resizeLocalTerminalSession(
			session.backendSessionId,
			clampTerminalColumns(payload?.cols),
			clampTerminalRows(payload?.rows),
		);
	} catch {
		// Session may have been closed.
	}
}

export function closeLocalTerminalBackend(session) {
	try {
		closeLocalTerminalSession(session.backendSessionId);
	} catch {
		// Already cleaned up.
	}
}
