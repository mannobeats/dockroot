import { randomUUID } from "node:crypto";

export async function startProxyTerminalSession({
	payload,
	socket,
	authCookie,
	resolvedEnvironmentId,
	terminalSessions,
	requestTerminalApi,
	clampTerminalColumns,
	clampTerminalRows,
	closeTrackedTerminalSession,
}) {
	const createResult = await requestTerminalApi("/api/runtime/terminal", {
		method: "POST",
		headers: { "content-type": "application/json" },
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
		return {
			error: String(createResult.payload?.error || "").trim() || "Unable to start terminal session.",
		};
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
					{ signal: pollAbort.signal },
				);

				if (pollAbort.signal.aborted) {
					return;
				}
				if (!readResult.ok) {
					socket.emit("terminal:exit", { sessionId, exitCode: -2 });
					await closeTrackedTerminalSession(sessionId);
					return;
				}

				const chunks = Array.isArray(readResult.payload?.chunks) ? readResult.payload.chunks : [];
				for (const chunk of chunks) {
					socket.emit("terminal:data", { sessionId, data: String(chunk || "") });
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
			socket.emit("terminal:exit", { sessionId, exitCode: -2 });
			await closeTrackedTerminalSession(sessionId);
		}
	};

	void poll();

	return { sessionId };
}

export function writeProxyTerminalSessionInput(session, payload, requestTerminalApi) {
	const environmentQuery = session.environmentId
		? `?environmentId=${encodeURIComponent(session.environmentId)}`
		: "";

	session.writeQueue = session.writeQueue
		.then(() =>
			requestTerminalApi(
				`/api/runtime/terminal/${encodeURIComponent(session.backendSessionId)}${environmentQuery}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						type: "input",
						data: String(payload.data || "").slice(0, 8192),
					}),
				},
			),
		)
		.catch(() => {});
}

export function resizeProxyTerminalSessionWindow(
	session,
	payload,
	requestTerminalApi,
	clampTerminalColumns,
	clampTerminalRows,
) {
	const environmentQuery = session.environmentId
		? `?environmentId=${encodeURIComponent(session.environmentId)}`
		: "";

	void requestTerminalApi(
		`/api/runtime/terminal/${encodeURIComponent(session.backendSessionId)}${environmentQuery}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				type: "resize",
				cols: clampTerminalColumns(payload?.cols),
				rows: clampTerminalRows(payload?.rows),
			}),
		},
	);
}

export async function closeProxyTerminalBackend(session, requestTerminalApiWithCookie) {
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
