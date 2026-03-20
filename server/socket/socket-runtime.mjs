import { createSocketAccessControl } from "./access-control.mjs";
import { attachSocketAuthMiddleware } from "./auth.mjs";
import { createLogRuntime } from "./log-runtime.mjs";
import { DEFAULT_SOCKET_EVENT_RATE_LIMITS, createSocketRateLimiter } from "./rate-limit.mjs";
import { createTerminalRuntime } from "./terminal-runtime.mjs";

export function createSocketRuntimeService({
	io,
	sql,
	dockerBinary,
	execFileAsync,
	getAppBaseUrl,
	isPrivilegedRole,
	isTrustedOrigin,
	emitRuntimeAction,
	containerStatsHub = null,
	agentSocketRuntime = null,
	runtimeMetricsService = null,
	maxSocketSessionsPerUser = 5,
	maxSocketConnectionsPerUser = 12,
	socketIdleTimeoutMs = 10 * 60 * 1000,
	socketEventRateLimits = DEFAULT_SOCKET_EVENT_RATE_LIMITS,
	logSessionKillTimeoutMs = 1_500,
}) {
	const wsRejectionCounters = {
		origin: 0,
		unauthorized: 0,
		connectionLimit: 0,
		rateLimited: 0,
	};
	let attached = false;

	const accessControl = createSocketAccessControl({
		sql,
		dockerBinary,
		execFileAsync,
		isPrivilegedRole,
	});

	const { consumeSocketRateLimit } = createSocketRateLimiter({
		socketEventRateLimits,
		wsRejectionCounters,
	});

	async function requestTerminalApiWithCookie(authCookie, path, init = {}) {
		const response = await fetch(`${getAppBaseUrl()}${path}`, {
			...init,
			headers: {
				accept: "application/json",
				...(authCookie ? { cookie: authCookie } : {}),
				...(init.headers || {}),
			},
			cache: "no-store",
		});
		const payload = await response.json().catch(() => ({}));
		return { ok: response.ok, payload };
	}

	const terminalRuntime = createTerminalRuntime({
		emitRuntimeAction,
		resolveOwnedEnvironmentWithKind: accessControl.resolveOwnedEnvironmentWithKind,
		requestTerminalApiWithCookie,
		consumeSocketRateLimit,
		maxSocketSessionsPerUser,
		socketIdleTimeoutMs,
	});

	const logRuntime = createLogRuntime({
		emitRuntimeAction,
		resolveOwnedEnvironmentId: accessControl.resolveOwnedEnvironmentId,
		canAccessContainer: accessControl.canAccessContainer,
		consumeSocketRateLimit,
		dockerBinary,
		logSessionKillTimeoutMs,
	});

	function getSocketRuntimeMetrics() {
		let authenticatedConnections = 0;
		for (const socket of io.of("/").sockets.values()) {
			if (socket.data?.userId) {
				authenticatedConnections += 1;
			}
		}

		return {
			connections: io.of("/").sockets.size,
			authenticatedConnections,
			terminalSessions: terminalRuntime.getSessionCount(),
			logSessions: logRuntime.getSessionCount(),
			rejections: { ...wsRejectionCounters },
		};
	}

	function attach() {
		if (attached) {
			return;
		}
		attached = true;

		attachSocketAuthMiddleware({
			io,
			isTrustedOrigin,
			getAppBaseUrl,
			maxSocketConnectionsPerUser,
			wsRejectionCounters,
		});

		io.on("connection", (socket) => {
			if (socket.data?.connectionType === "agent") {
				return;
			}

			const authCookie = String(socket.request.headers.cookie || "");
			emitRuntimeAction("socket.connected", {
				userId: socket.data.userId,
				role: socket.data.role,
				socketId: socket.id,
				environmentId: null,
			});

			socket.on("room:join", async (room) => {
				if (
					typeof room === "string" &&
					room.length > 0 &&
					(await accessControl.canAccessStackRoom(socket.data.userId, socket.data.role, room))
				) {
					socket.join(room);
				}
			});

			socket.on("room:leave", (room) => {
				if (typeof room === "string" && room.length > 0) {
					socket.leave(room);
				}
			});

			// --- Per-container stats (Arcane-inspired) ---
			socket.on("container:stats:subscribe", async (input) => {
				if (!(socket.data?.role && isPrivilegedRole(socket.data.role))) return;
				const containerId = typeof input === "string" ? input : input?.containerId;
				if (!containerId) return;

				const environmentKind = input?.environmentKind || "local";
				if (environmentKind === "agent") {
					agentSocketRuntime?.subscribeContainerStats(socket, containerId, input?.environmentId);
				} else {
					containerStatsHub?.subscribe(socket, containerId);
				}
			});

			socket.on("container:stats:unsubscribe", (input) => {
				const containerId = typeof input === "string" ? input : input?.containerId;
				if (!containerId) return;

				const environmentKind = input?.environmentKind || "local";
				if (environmentKind === "agent") {
					agentSocketRuntime?.unsubscribeContainerStats(socket, containerId, input?.environmentId);
				} else {
					containerStatsHub?.unsubscribe(socket, containerId);
				}
			});

			// --- Environment-level metrics (dashboard live telemetry) ---
			socket.on("metrics:subscribe", async (input) => {
				if (!(socket.data?.role && isPrivilegedRole(socket.data.role))) return;

				const environmentKind = input?.environmentKind === "agent" ? "agent" : "local";
				if (environmentKind === "local") {
					runtimeMetricsService?.addMetricsSubscriber(socket);
				} else if (input?.environmentId) {
					const env = await accessControl.resolveOwnedEnvironmentWithKind?.(
						socket.data.userId,
						input.environmentId,
					);
					if (env?.id && env.kind === "agent") {
						const room = `metrics:env:${env.id}`;
						socket.join(room);
						agentSocketRuntime?.addEnvironmentSubscriber(env.id);
						socket.data._agentMetricsRooms = socket.data._agentMetricsRooms || new Set();
						socket.data._agentMetricsRooms.add(env.id);
					}
				}
			});

			socket.on("metrics:unsubscribe", (input) => {
				const environmentKind = input?.environmentKind === "agent" ? "agent" : "local";
				if (environmentKind === "local") {
					runtimeMetricsService?.removeMetricsSubscriber(socket);
				} else if (input?.environmentId) {
					const room = `metrics:env:${input.environmentId}`;
					socket.leave(room);
					agentSocketRuntime?.removeEnvironmentSubscriber(input.environmentId);
					socket.data._agentMetricsRooms?.delete(input.environmentId);
				}
			});

			terminalRuntime.registerSocketHandlers({ socket, authCookie });
			logRuntime.registerSocketHandlers(socket);

			socket.on("disconnect", () => {
				emitRuntimeAction("socket.disconnected", {
					userId: socket.data.userId,
					role: socket.data.role,
					socketId: socket.id,
					environmentId: null,
				});

				// Clean up per-container stats
				containerStatsHub?.unsubscribeAll(socket);

				// Clean up environment-level subscriptions
				runtimeMetricsService?.removeMetricsSubscriber(socket);
				if (socket.data._agentMetricsRooms) {
					for (const envId of socket.data._agentMetricsRooms) {
						agentSocketRuntime?.removeEnvironmentSubscriber(envId);
					}
				}

				// Clean up agent per-container stats
				agentSocketRuntime?.unsubscribeAllContainerStats(socket);

				terminalRuntime.closeSocketTerminalSessions(socket.id);
				logRuntime.closeSocketLogSessions(socket.id);
			});
		});
	}

	async function closeAllSessions() {
		await terminalRuntime.closeAllTerminalSessions();
		logRuntime.closeAllLogSessions();
	}

	return {
		accessControl,
		attach,
		closeAllSessions,
		getSocketRuntimeMetrics,
	};
}
