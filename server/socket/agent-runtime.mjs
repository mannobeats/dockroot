/**
 * Agent WebSocket runtime: handles persistent WebSocket connections from remote agents.
 * Enables hub-initiated pulls for metrics (Beszel pattern) and real-time streaming.
 */
export function createAgentSocketRuntime({
	io,
	sql,
	isShuttingDown,
	persistRuntimeSnapshotMetrics,
	emitRealtime,
}) {
	// Map<environmentId, { socket, agentId, streaming }>
	const connectedAgents = new Map();

	// Map<environmentId, number> — count of dashboard subscribers watching this env
	const envSubscriberCounts = new Map();

	function attach() {
		io.on("connection", (socket) => {
			const auth = socket.handshake.auth || {};

			// Only handle agent connections (identified by agentToken in auth)
			if (!auth.agentToken || !auth.environmentId) {
				return;
			}

			const { agentId, environmentId } = auth;

			// Verify agent token against DB
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
					// Agent confirms identity after connect
					const entry = connectedAgents.get(environmentId);
					if (entry) {
						entry.agentId = data.agentId || agentId;
					}
				});

				socket.on("agent:snapshot", async (data) => {
					if (!data.snapshot) {
						return;
					}

					try {
						await persistRuntimeSnapshotMetrics({
							environmentId,
							snapshot: data.snapshot,
							source: "agent",
						});

						emitRealtime("runtime:metrics", {
							environmentId,
							at: Date.now(),
							containers: data.snapshot.containerStats || [],
							host: {
								source: "native",
								cpuPercent: data.snapshot.usage?.cpuPercent ?? null,
								memoryPercent: data.snapshot.usage?.memoryPercent ?? null,
							},
						});
					} catch (error) {
						console.error(
							"[agent:ws] Failed to persist snapshot:",
							error instanceof Error ? error.message : "unknown error",
						);
					}
				});

				socket.on("agent:metrics", async (data) => {
					if (!data.snapshot) {
						return;
					}

					try {
						await persistRuntimeSnapshotMetrics({
							environmentId,
							snapshot: data.snapshot,
							source: "agent",
						});

						emitRealtime("runtime:metrics", {
							environmentId,
							at: data.at || Date.now(),
							containers: data.snapshot.containerStats || [],
							host: {
								source: "native",
								cpuPercent: data.snapshot.usage?.cpuPercent ?? null,
								memoryPercent: data.snapshot.usage?.memoryPercent ?? null,
							},
						});
					} catch (error) {
						console.error(
							"[agent:ws] Failed to persist streaming metrics:",
							error instanceof Error ? error.message : "unknown error",
						);
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
		if (!entry) {
			return;
		}
		const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		entry.socket.emit("agent:request-snapshot", requestId);
	}

	function startAgentStreaming(environmentId) {
		const entry = connectedAgents.get(environmentId);
		if (!entry || entry.streaming) {
			return;
		}
		entry.streaming = true;
		entry.socket.emit("agent:start-streaming", 2_000);
	}

	function stopAgentStreaming(environmentId) {
		const entry = connectedAgents.get(environmentId);
		if (!entry || !entry.streaming) {
			return;
		}
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

	function isAgentConnected(environmentId) {
		return connectedAgents.has(environmentId);
	}

	function getConnectedAgentCount() {
		return connectedAgents.size;
	}

	return {
		attach,
		requestAgentSnapshot,
		startAgentStreaming,
		stopAgentStreaming,
		addEnvironmentSubscriber,
		removeEnvironmentSubscriber,
		isAgentConnected,
		getConnectedAgentCount,
	};
}
