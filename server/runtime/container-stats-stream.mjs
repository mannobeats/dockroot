import http from "node:http";
import https from "node:https";

const DEFAULT_DOCKER_SOCKET_PATH = "/var/run/docker.sock";

/**
 * Per-container Docker stats streaming hub.
 *
 * Architecture (Arcane-inspired):
 * - One Docker stats stream per container (using Docker API `stream=true`)
 * - Multiple Socket.IO clients can watch the same container, sharing one stream
 * - When last client unsubscribes, the stream is stopped automatically
 * - Raw numeric values computed server-side, sent to clients
 */
export function createContainerStatsHub({ isShuttingDown }) {
	const dockerEndpoint = resolveDockerEndpoint(process.env.DOCKER_HOST);

	// Map<containerId, { subscribers: Set<socketId>, abort: AbortController, prev: object }>
	const streams = new Map();

	function subscribe(socket, containerId) {
		let entry = streams.get(containerId);
		if (entry) {
			entry.subscribers.add(socket.id);
			// Send last known stats immediately so client doesn't wait for next tick
			if (entry.lastStats) {
				socket.emit("container:stats", entry.lastStats);
			}
			return;
		}

		entry = {
			subscribers: new Set([socket.id]),
			abort: new AbortController(),
			lastStats: null,
		};
		streams.set(containerId, entry);
		startStream(containerId, entry);
	}

	function unsubscribe(socket, containerId) {
		const entry = streams.get(containerId);
		if (!entry) return;
		entry.subscribers.delete(socket.id);
		if (entry.subscribers.size === 0) {
			entry.abort.abort();
			streams.delete(containerId);
		}
	}

	function unsubscribeAll(socket) {
		for (const [containerId, entry] of streams) {
			entry.subscribers.delete(socket.id);
			if (entry.subscribers.size === 0) {
				entry.abort.abort();
				streams.delete(containerId);
			}
		}
	}

	function startStream(containerId, entry) {
		const path = `/containers/${encodeURIComponent(containerId)}/stats?stream=true`;
		const client = dockerEndpoint.kind === "https" ? https : http;

		const requestOptions =
			dockerEndpoint.kind === "socket"
				? { socketPath: dockerEndpoint.socketPath, path, method: "GET" }
				: { hostname: dockerEndpoint.hostname, port: dockerEndpoint.port, path: `${dockerEndpoint.basePath || ""}${path}`, method: "GET" };

		const req = client.request(requestOptions, (res) => {
			let buffer = "";

			res.setEncoding("utf8");
			res.on("data", (chunk) => {
				if (isShuttingDown() || entry.abort.signal.aborted) {
					res.destroy();
					return;
				}

				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						const raw = JSON.parse(trimmed);
						const stats = computeContainerStats(containerId, raw);
						entry.lastStats = stats;
						emitToSubscribers(entry, stats, containerId);
					} catch {
						// Skip malformed lines
					}
				}
			});

			res.on("end", () => {
				// Stream ended (container stopped?) — clean up and notify
				if (streams.has(containerId) && !entry.abort.signal.aborted) {
					streams.delete(containerId);
				}
			});

			res.on("error", () => {
				if (streams.has(containerId) && !entry.abort.signal.aborted) {
					streams.delete(containerId);
				}
			});
		});

		req.on("error", () => {
			if (streams.has(containerId) && !entry.abort.signal.aborted) {
				streams.delete(containerId);
			}
		});

		entry.abort.signal.addEventListener("abort", () => {
			req.destroy();
		});

		req.end();
	}

	function emitToSubscribers(entry, stats, containerId) {
		const io = globalThis.__dockroot_io;
		if (!io) return;
		for (const socketId of entry.subscribers) {
			const socket = io.of("/").sockets.get(socketId);
			if (socket) {
				socket.emit("container:stats", stats);
			} else {
				entry.subscribers.delete(socketId);
			}
		}
		if (entry.subscribers.size === 0 && streams.has(containerId)) {
			entry.abort.abort();
			streams.delete(containerId);
		}
	}

	function getActiveStreamCount() {
		return streams.size;
	}

	function destroy() {
		for (const entry of streams.values()) {
			entry.abort.abort();
		}
		streams.clear();
	}

	return {
		subscribe,
		unsubscribe,
		unsubscribeAll,
		getActiveStreamCount,
		destroy,
	};
}

function computeContainerStats(containerId, raw) {
	const cpuDelta =
		Number(raw?.cpu_stats?.cpu_usage?.total_usage || 0) -
		Number(raw?.precpu_stats?.cpu_usage?.total_usage || 0);
	const systemDelta =
		Number(raw?.cpu_stats?.system_cpu_usage || 0) -
		Number(raw?.precpu_stats?.system_cpu_usage || 0);
	const onlineCpus =
		Number(raw?.cpu_stats?.online_cpus || 0) ||
		Number(raw?.cpu_stats?.cpu_usage?.percpu_usage?.length || 0) ||
		1;

	const cpuPercent =
		cpuDelta > 0 && systemDelta > 0
			? Number(((cpuDelta / systemDelta) * onlineCpus * 100).toFixed(2))
			: 0;

	const memUsage = Number(raw?.memory_stats?.usage || 0);
	const memStats = raw?.memory_stats?.stats || {};
	const memCache =
		Number(memStats?.inactive_file || 0) ||
		Number(memStats?.total_inactive_file || 0) ||
		Number(memStats?.cache || 0);
	const memoryUsageBytes = Math.max(0, memUsage - memCache);
	const memoryLimitBytes = Number(raw?.memory_stats?.limit || 0);
	const memoryPercent =
		memoryLimitBytes > 0
			? Number(((memoryUsageBytes / memoryLimitBytes) * 100).toFixed(2))
			: 0;

	let networkRxBytes = 0;
	let networkTxBytes = 0;
	const networks = raw?.networks || {};
	for (const iface of Object.values(networks)) {
		networkRxBytes += Number(iface?.rx_bytes || 0);
		networkTxBytes += Number(iface?.tx_bytes || 0);
	}

	const blkio = Array.isArray(raw?.blkio_stats?.io_service_bytes_recursive)
		? raw.blkio_stats.io_service_bytes_recursive
		: [];
	let blockReadBytes = 0;
	let blockWriteBytes = 0;
	for (const entry of blkio) {
		const op = String(entry?.op || "").toLowerCase();
		if (op === "read") blockReadBytes += Number(entry?.value || 0);
		else if (op === "write") blockWriteBytes += Number(entry?.value || 0);
	}

	const pids = Number(raw?.pids_stats?.current || 0);

	return {
		containerId,
		cpuPercent,
		memoryUsageBytes,
		memoryLimitBytes,
		memoryPercent,
		networkRxBytes,
		networkTxBytes,
		blockReadBytes,
		blockWriteBytes,
		pids,
	};
}

function resolveDockerEndpoint(input) {
	const dockerHost = String(input || "").trim();
	if (!dockerHost) {
		return { kind: "socket", socketPath: DEFAULT_DOCKER_SOCKET_PATH };
	}
	if (dockerHost.startsWith("unix://")) {
		return { kind: "socket", socketPath: dockerHost.slice("unix://".length) || DEFAULT_DOCKER_SOCKET_PATH };
	}
	if (dockerHost.startsWith("tcp://")) {
		return resolveDockerEndpoint(`http://${dockerHost.slice("tcp://".length)}`);
	}
	if (dockerHost.startsWith("http://") || dockerHost.startsWith("https://")) {
		const url = new URL(dockerHost);
		return {
			kind: url.protocol === "https:" ? "https" : "http",
			hostname: url.hostname,
			port: Number(url.port || (url.protocol === "https:" ? 443 : 2375)),
			basePath: (url.pathname || "").replace(/\/$/, "") || "",
		};
	}
	return { kind: "socket", socketPath: dockerHost };
}
