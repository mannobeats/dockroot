/**
 * Agent WebSocket runtime: handles persistent WebSocket connections from remote agents.
 * Enables hub-initiated pulls for metrics and per-container stats streaming.
 */
export function createAgentSocketRuntime({
	io,
	sql,
	isShuttingDown,
	persistRuntimeSnapshotMetrics,
}) {
	// Map<environmentId, { socket, agentId, streaming }>
	const connectedAgents = new Map();

	// Map<environmentId, number> — count of dashboard subscribers watching this env
	const envSubscriberCounts = new Map();
	const latestSnapshots = new Map();

	// Map<`${environmentId}:${containerId}`, Set<socketId>> — per-container stats subscribers
	const containerStatsSubscribers = new Map();

	function cacheSnapshot(environmentId, snapshot, sampledAt = Date.now()) {
		latestSnapshots.set(environmentId, { snapshot, sampledAt });
	}

	function emitRuntimeMetrics(environmentId, snapshot, at = Date.now()) {
		io.to(`metrics:env:${environmentId}`).emit("runtime:metrics", {
			environmentId,
			at,
			host: {
				source: "native",
				cpuPercent: snapshot.usage?.cpuPercent ?? null,
				memoryPercent: snapshot.usage?.memoryPercent ?? null,
			},
		});
	}

	function attach() {
		io.on("connection", (socket) => {
			const auth = socket.handshake.auth || {};

			// Only handle agent connections (identified by agentToken in auth)
			if (!auth.agentToken || !auth.environmentId) return;

			const { agentId, environmentId } = auth;

			verifyAgentToken(auth.agentToken, agentId).then((valid) => {
				if (!valid) {
					socket.disconnect(true);
					return;
				}

				connectedAgents.set(environmentId, {
					socket,
					agentId,
					streaming: false,
				});

				console.log(`[agent:ws] Agent ${agentId} connected for environment ${environmentId}`);

				socket.on("agent:identify", (data) => {
					const entry = connectedAgents.get(environmentId);
					if (entry) {
						entry.agentId = data.agentId || agentId;
					}
				});

				socket.on("agent:snapshot", async (data) => {
					if (!data.snapshot) return;
					try {
						cacheSnapshot(environmentId, data.snapshot);
						await persistRuntimeSnapshotMetrics({
							environmentId,
							snapshot: data.snapshot,
							source: "agent",
						});
						emitRuntimeMetrics(environmentId, data.snapshot);
					} catch (error) {
						console.error("[agent:ws] Failed to persist snapshot:", error?.message);
					}
				});

				socket.on("agent:metrics", async (data) => {
					if (!data.snapshot) return;
					try {
						cacheSnapshot(environmentId, data.snapshot, data.at || Date.now());
						await persistRuntimeSnapshotMetrics({
							environmentId,
							snapshot: data.snapshot,
							source: "agent",
						});
						emitRuntimeMetrics(environmentId, data.snapshot, data.at || Date.now());
					} catch (error) {
						console.error("[agent:ws] Failed to persist streaming metrics:", error?.message);
					}
				});

				// Per-container stats from agent → forward to subscribing clients
				socket.on("agent:container:stats", (data) => {
					if (!data?.containerId) return;
					const key = `${environmentId}:${data.containerId}`;
					const subscribers = containerStatsSubscribers.get(key);
					if (!subscribers || subscribers.size === 0) return;

					for (const socketId of subscribers) {
						const clientSocket = io.of("/").sockets.get(socketId);
						if (clientSocket) {
							clientSocket.emit("container:stats", data);
						} else {
							subscribers.delete(socketId);
						}
					}
				});

				socket.on("disconnect", () => {
					console.log(`[agent:ws] Agent ${agentId} disconnected from environment ${environmentId}`);
					connectedAgents.delete(environmentId);
				});

				// If there are already subscribers watching this environment, start streaming
				const subCount = envSubscriberCounts.get(environmentId) || 0;
				if (subCount > 0) {
					startAgentStreaming(environmentId);
				}
			});
		});
	}

	async function verifyAgentToken(token, agentId) {
		try {
			const result = await sql`
				select id from agents
				where access_token = ${token}
				  and id = ${agentId}
				limit 1
			`;
			return result.length > 0;
		} catch {
			return false;
		}
	}

	function requestAgentSnapshot(environmentId) {
		const entry = connectedAgents.get(environmentId);
		if (!entry) return;
		const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		entry.socket.emit("agent:request-snapshot", requestId);
	}

	function startAgentStreaming(environmentId) {
		const entry = connectedAgents.get(environmentId);
		if (!entry || entry.streaming) return;
		entry.streaming = true;
		entry.socket.emit("agent:start-streaming", 2_000);
	}

	function stopAgentStreaming(environmentId) {
		const entry = connectedAgents.get(environmentId);
		if (!entry || !entry.streaming) return;
		entry.streaming = false;
		entry.socket.emit("agent:stop-streaming");
	}

	function addEnvironmentSubscriber(environmentId) {
		const current = envSubscriberCounts.get(environmentId) || 0;
		envSubscriberCounts.set(environmentId, current + 1);
		if (current === 0) {
			startAgentStreaming(environmentId);
		}
	}

	function removeEnvironmentSubscriber(environmentId) {
		const current = envSubscriberCounts.get(environmentId) || 0;
		const next = Math.max(0, current - 1);
		envSubscriberCounts.set(environmentId, next);
		if (next === 0) {
			stopAgentStreaming(environmentId);
		}
	}

	// Per-container stats: client subscribes to a specific container on a remote agent
	function subscribeContainerStats(clientSocket, containerId, environmentId) {
		if (!environmentId || !containerId) return;
		const key = `${environmentId}:${containerId}`;
		let subscribers = containerStatsSubscribers.get(key);
		if (!subscribers) {
			subscribers = new Set();
			containerStatsSubscribers.set(key, subscribers);
		}
		const wasEmpty = subscribers.size === 0;
		subscribers.add(clientSocket.id);

		// Tell agent to start streaming this container's stats
		if (wasEmpty) {
			const entry = connectedAgents.get(environmentId);
			if (entry) {
				entry.socket.emit("agent:container:stats:start", containerId);
			}
		}
	}

	function unsubscribeContainerStats(clientSocket, containerId, environmentId) {
		if (!environmentId || !containerId) return;
		const key = `${environmentId}:${containerId}`;
		const subscribers = containerStatsSubscribers.get(key);
		if (!subscribers) return;
		subscribers.delete(clientSocket.id);

		if (subscribers.size === 0) {
			containerStatsSubscribers.delete(key);
			const entry = connectedAgents.get(environmentId);
			if (entry) {
				entry.socket.emit("agent:container:stats:stop", containerId);
			}
		}
	}

	function unsubscribeAllContainerStats(clientSocket) {
		for (const [key, subscribers] of containerStatsSubscribers) {
			subscribers.delete(clientSocket.id);
			if (subscribers.size === 0) {
				containerStatsSubscribers.delete(key);
				const [environmentId, containerId] = key.split(":");
				const entry = connectedAgents.get(environmentId);
				if (entry && containerId) {
					entry.socket.emit("agent:container:stats:stop", containerId);
				}
			}
		}
	}

	function isAgentConnected(environmentId) {
		return connectedAgents.has(environmentId);
	}

	function getConnectedAgentCount() {
		return connectedAgents.size;
	}

	function getLatestSnapshot(environmentId, maxAgeMs = 45_000) {
		const entry = latestSnapshots.get(environmentId);
		if (!entry) return null;
		if (Date.now() - entry.sampledAt > maxAgeMs) return null;
		return entry;
	}

	return {
		attach,
		requestAgentSnapshot,
		startAgentStreaming,
		stopAgentStreaming,
		addEnvironmentSubscriber,
		removeEnvironmentSubscriber,
		subscribeContainerStats,
		unsubscribeContainerStats,
		unsubscribeAllContainerStats,
		isAgentConnected,
		getConnectedAgentCount,
		getLatestSnapshot,
		cacheSnapshot,
	};
}
