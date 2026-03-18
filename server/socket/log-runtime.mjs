import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export function createLogRuntime({
	emitRuntimeAction,
	resolveOwnedEnvironmentId,
	canAccessContainer,
	consumeSocketRateLimit,
	dockerBinary,
	logSessionKillTimeoutMs,
}) {
	const logSessions = new Map();

	function teardownLogProcess(processEntry, signal = "SIGTERM") {
		if (!processEntry || processEntry.cleanedUp) {
			return;
		}

		processEntry.cleanedUp = true;
		if (processEntry.forceKillTimer) {
			clearTimeout(processEntry.forceKillTimer);
			processEntry.forceKillTimer = null;
		}
		processEntry.child.stdout?.off("data", processEntry.onStdout);
		processEntry.child.stderr?.off("data", processEntry.onStderr);
		processEntry.child.off("close", processEntry.onClose);
		processEntry.child.off("error", processEntry.onError);

		if (!processEntry.closed) {
			try {
				processEntry.child.kill(signal);
			} catch {
				// Child may already be gone.
			}

			if (signal === "SIGTERM") {
				processEntry.forceKillTimer = setTimeout(() => {
					if (processEntry.closed) {
						return;
					}
					try {
						processEntry.child.kill("SIGKILL");
					} catch {
						// Child may already be gone.
					}
				}, logSessionKillTimeoutMs);
				processEntry.forceKillTimer.unref?.();
			}
		}
	}

	function closeTrackedLogSession(sessionId) {
		const session = logSessions.get(sessionId);
		if (!session) {
			return;
		}

		logSessions.delete(sessionId);
		for (const processEntry of session.processes) {
			teardownLogProcess(processEntry);
		}
	}

	function getSessionCount() {
		return logSessions.size;
	}

	function closeSocketLogSessions(socketId) {
		for (const [sessionId, session] of logSessions.entries()) {
			if (session.socketId === socketId) {
				closeTrackedLogSession(sessionId);
			}
		}
	}

	function closeAllLogSessions() {
		for (const sessionId of Array.from(logSessions.keys())) {
			closeTrackedLogSession(sessionId);
		}
	}

	function registerSocketHandlers(socket) {
		socket.on("logs:subscribe", async (payload, callback) => {
			try {
				if (!consumeSocketRateLimit(socket, "logs:subscribe")) {
					callback?.({ error: "Too many log stream requests. Please wait a moment." });
					emitRuntimeAction("logs.subscribe.failed", {
						userId: socket.data.userId,
						socketId: socket.id,
						reason: "rate_limited",
						environmentId: payload?.environmentId,
					});
					return;
				}

				const resolvedEnvironmentId = await resolveOwnedEnvironmentId(
					socket.data.userId,
					payload?.environmentId,
				);
				if (resolvedEnvironmentId === null) {
					callback?.({ error: "Environment not found." });
					emitRuntimeAction("logs.subscribe.failed", {
						userId: socket.data.userId,
						socketId: socket.id,
						reason: "invalid_environment",
						environmentId: payload?.environmentId,
					});
					return;
				}

				const sessionId = payload?.sessionId || randomUUID();
				closeTrackedLogSession(sessionId);

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
					callback?.({ error: "No accessible containers selected for log streaming." });
					emitRuntimeAction("logs.subscribe.failed", {
						userId: socket.data.userId,
						socketId: socket.id,
						reason: "no_accessible_containers",
						environmentId: resolvedEnvironmentId || null,
					});
					return;
				}

				const processes = allowedContainerIds.map((containerId) => {
					const child = spawn(
						dockerBinary,
						["logs", "-f", "--tail", String(payload?.tail || 150), "--timestamps", containerId],
						{ stdio: ["ignore", "pipe", "pipe"] },
					);

					const processEntry = {
						child,
						forceKillTimer: null,
						closed: false,
						cleanedUp: false,
						onStdout: (data) => {
							socket.emit("logs:data", { sessionId, containerId, chunk: data.toString() });
						},
						onStderr: (data) => {
							socket.emit("logs:data", { sessionId, containerId, chunk: data.toString() });
						},
						onClose: (code) => {
							processEntry.closed = true;
							if (processEntry.forceKillTimer) {
								clearTimeout(processEntry.forceKillTimer);
								processEntry.forceKillTimer = null;
							}
							teardownLogProcess(processEntry, "SIGKILL");
							socket.emit("logs:exit", { sessionId, containerId, code });
						},
					};

					child.stdout.on("data", processEntry.onStdout);
					child.stderr.on("data", processEntry.onStderr);
					child.on("close", processEntry.onClose);
					processEntry.onError = () => {
						socket.emit("logs:data", {
							sessionId,
							containerId,
							chunk: "Unable to stream logs.\n",
						});
					};
					child.on("error", processEntry.onError);

					return processEntry;
				});

				logSessions.set(sessionId, {
					processes,
					socketId: socket.id,
					environmentId: resolvedEnvironmentId || "",
				});

				callback?.({ sessionId });
				emitRuntimeAction("logs.subscribe.succeeded", {
					userId: socket.data.userId,
					socketId: socket.id,
					sessionId,
					containerCount: allowedContainerIds.length,
					environmentId: resolvedEnvironmentId || null,
				});
			} catch (error) {
				callback?.({
					error: error instanceof Error ? error.message : "Unable to start log stream.",
				});
				emitRuntimeAction("logs.subscribe.failed", {
					userId: socket.data.userId,
					socketId: socket.id,
					reason: "unexpected_error",
					environmentId: payload?.environmentId,
				});
			}
		});

		socket.on("logs:unsubscribe", (payload) => {
			if (!consumeSocketRateLimit(socket, "logs:unsubscribe")) {
				return;
			}

			const session = logSessions.get(payload?.sessionId);
			if (session?.socketId === socket.id) {
				emitRuntimeAction("logs.unsubscribe", {
					userId: socket.data.userId,
					socketId: socket.id,
					sessionId: payload.sessionId,
					environmentId: session.environmentId || null,
				});
				closeTrackedLogSession(payload.sessionId);
			}
		});
	}

	return {
		closeAllLogSessions,
		closeSocketLogSessions,
		getSessionCount,
		registerSocketHandlers,
	};
}
