import http from "node:http";
import https from "node:https";
import os from "node:os";

const DEFAULT_DOCKER_SOCKET_PATH = "/var/run/docker.sock";
const DEFAULT_TIMEOUT_MS = 15_000;

export async function collectDockerEngineSnapshot(options = {}) {
	const endpoint = resolveDockerEndpoint(options.dockerHost || process.env.DOCKER_HOST);
	const timeoutMs =
		Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0
			? Number(options.timeoutMs)
			: DEFAULT_TIMEOUT_MS;

	const [version, containers, images, volumesResult, networks] = await Promise.all([
		requestDockerJson(endpoint, "/version", { timeoutMs }),
		requestDockerJson(endpoint, "/containers/json?all=1&size=1", { timeoutMs }),
		requestDockerJson(endpoint, "/images/json?digests=1", { timeoutMs }),
		requestDockerJson(endpoint, "/volumes", { timeoutMs }),
		requestDockerJson(endpoint, "/networks", { timeoutMs }),
	]);

	const containerRows = Array.isArray(containers) ? containers.map(mapContainerSummaryRow) : [];
	const imageRows = Array.isArray(images) ? images : [];
	const volumeRows = Array.isArray(volumesResult?.Volumes) ? volumesResult.Volumes : [];
	const networkRows = Array.isArray(networks) ? networks : [];
	const runningContainers = Array.isArray(containers)
		? containers.filter((container) => String(container?.State || "").toLowerCase() === "running")
		: [];

	const statsResults = await Promise.all(
		runningContainers.map(async (container) => {
			try {
				const stats = await requestDockerJson(
					endpoint,
					`/containers/${encodeURIComponent(container.Id)}/stats?stream=false`,
					{ timeoutMs },
				);
				return mapContainerStatsRow(container, stats);
			} catch {
				return buildEmptyContainerStatsRow(container);
			}
		}),
	);

	const statsRows = statsResults.filter(Boolean);
	const cpuPercent = Number(
		statsRows
			.reduce((sum, row) => sum + (parsePercentString(row.CPUPerc) || 0), 0)
			.toFixed(1),
	);
	const memoryPercent = Number(
		statsRows
			.reduce((sum, row) => sum + (parsePercentString(row.MemPerc) || 0), 0)
			.toFixed(1),
	);

	return {
		host: {
			hostname:
				process.platform === "win32" ? process.env.COMPUTERNAME || "unknown" : os.hostname(),
			platform: `${os.platform()} ${os.release()}`,
			architecture: os.arch(),
			dockerVersion: String(version?.Version || "unknown"),
			cpus: os.cpus().length,
			totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
			freeMemoryGb: Number((os.freemem() / 1024 / 1024 / 1024).toFixed(1)),
		},
		containers: containerRows,
		images: imageRows,
		volumes: volumeRows,
		networks: networkRows,
		counts: {
			containers: containerRows.length,
			runningContainers: runningContainers.length,
			images: imageRows.length,
			volumes: volumeRows.length,
			networks: networkRows.length,
		},
		usage: {
			cpuPercent,
			memoryPercent,
		},
		containerStats: statsRows,
	};
}

function resolveDockerEndpoint(input) {
	const dockerHost = String(input || "").trim();
	if (!dockerHost) {
		return {
			kind: "socket",
			socketPath: DEFAULT_DOCKER_SOCKET_PATH,
		};
	}

	if (dockerHost.startsWith("unix://")) {
		return {
			kind: "socket",
			socketPath: dockerHost.slice("unix://".length) || DEFAULT_DOCKER_SOCKET_PATH,
		};
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
			basePath: normalizeBasePath(url.pathname),
		};
	}

	if (dockerHost.startsWith("npipe://")) {
		throw new Error("Windows named-pipe Docker hosts are not supported by the native collector yet.");
	}

	return {
		kind: "socket",
		socketPath: dockerHost,
	};
}

function normalizeBasePath(value) {
	const basePath = String(value || "").trim();
	if (!basePath || basePath === "/") {
		return "";
	}
	return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
}

function requestDockerJson(endpoint, requestPath, options = {}) {
	return new Promise((resolve, reject) => {
		const timeoutMs =
			Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0
				? Number(options.timeoutMs)
				: DEFAULT_TIMEOUT_MS;
		const client = endpoint.kind === "https" ? https : http;
		const path = `${endpoint.basePath || ""}${requestPath.startsWith("/") ? requestPath : `/${requestPath}`}`;
		const requestOptions =
			endpoint.kind === "socket"
				? {
						socketPath: endpoint.socketPath,
						path,
						method: "GET",
						headers: {
							accept: "application/json",
						},
				  }
				: {
						hostname: endpoint.hostname,
						port: endpoint.port,
						path,
						method: "GET",
						headers: {
							accept: "application/json",
						},
				  };

		const req = client.request(requestOptions, (res) => {
			let body = "";
			res.setEncoding("utf8");
			res.on("data", (chunk) => {
				body += chunk;
			});
			res.on("end", () => {
				if ((res.statusCode || 500) >= 400) {
					reject(new Error(body || `Docker API request failed for ${requestPath}`));
					return;
				}

				try {
					resolve(body ? JSON.parse(body) : null);
				} catch (error) {
					reject(
						error instanceof Error
							? error
							: new Error(`Failed to parse Docker API response for ${requestPath}`),
					);
				}
			});
		});

		req.on("error", reject);
		req.setTimeout(timeoutMs, () => {
			req.destroy(new Error(`Docker API request timed out after ${timeoutMs}ms for ${requestPath}`));
		});
		req.end();
	});
}

function mapContainerSummaryRow(container) {
	const name = normalizeContainerName(container?.Names);
	return {
		ID: String(container?.Id || ""),
		Name: name,
		Names: name,
		Image: String(container?.Image || ""),
		ImageID: String(container?.ImageID || ""),
		Command: String(container?.Command || ""),
		State: String(container?.State || ""),
		Status: String(container?.Status || ""),
		Labels: serializeLabels(container?.Labels),
		Ports: serializePorts(container?.Ports),
		HealthStatus: inferHealthStatus(container?.Status),
	};
}

function mapContainerStatsRow(container, stats) {
	const name = normalizeContainerName(container?.Names);
	const cpuPercent = computeCpuPercent(stats);
	const memoryUsageBytes = computeMemoryUsageBytes(stats);
	const memoryLimitBytes = Number(stats?.memory_stats?.limit || 0);
	const memoryPercent =
		memoryLimitBytes > 0 ? Number(((memoryUsageBytes / memoryLimitBytes) * 100).toFixed(1)) : 0;
	const { rxBytes, txBytes } = computeNetworkTotals(stats);
	const { readBytes, writeBytes } = computeBlockIoTotals(stats);
	const pids = Number(stats?.pids_stats?.current || 0);

	return {
		ID: String(container?.Id || stats?.id || ""),
		Name: name,
		Container: name,
		CPUPerc: `${cpuPercent.toFixed(1)}%`,
		MemUsage: `${formatBytesBinary(memoryUsageBytes)} / ${formatBytesBinary(memoryLimitBytes)}`,
		MemPerc: `${memoryPercent.toFixed(1)}%`,
		NetIO: `${formatBytesBinary(rxBytes)} / ${formatBytesBinary(txBytes)}`,
		BlockIO: `${formatBytesBinary(readBytes)} / ${formatBytesBinary(writeBytes)}`,
		PIDs: String(pids),
	};
}

function buildEmptyContainerStatsRow(container) {
	const name = normalizeContainerName(container?.Names);
	return {
		ID: String(container?.Id || ""),
		Name: name,
		Container: name,
		CPUPerc: "0.0%",
		MemUsage: "0B / 0B",
		MemPerc: "0.0%",
		NetIO: "0B / 0B",
		BlockIO: "0B / 0B",
		PIDs: "0",
	};
}

function normalizeContainerName(names) {
	if (Array.isArray(names)) {
		return String(names[0] || "").replace(/^\//, "");
	}
	return String(names || "").replace(/^\//, "");
}

function serializeLabels(labels) {
	if (!labels || typeof labels !== "object") {
		return "";
	}
	return Object.entries(labels)
		.map(([key, value]) => `${key}=${value}`)
		.join(",");
}

function serializePorts(ports) {
	if (!Array.isArray(ports) || ports.length === 0) {
		return "";
	}
	return ports
		.map((port) => {
			const privatePort = port?.PrivatePort ? String(port.PrivatePort) : "";
			const type = port?.Type ? String(port.Type) : "tcp";
			const publicPort = port?.PublicPort ? String(port.PublicPort) : "";
			const ip = port?.IP ? String(port.IP) : "";
			if (publicPort) {
				return `${ip ? `${ip}:` : ""}${publicPort}->${privatePort}/${type}`;
			}
			return privatePort ? `${privatePort}/${type}` : "";
		})
		.filter(Boolean)
		.join(", ");
}

function inferHealthStatus(status) {
	const match = String(status || "").match(/\((healthy|unhealthy|health: starting)\)/i);
	if (!match) {
		return null;
	}
	const raw = match[1].toLowerCase();
	return raw === "health: starting" ? "starting" : raw;
}

function computeCpuPercent(stats) {
	const cpuDelta =
		Number(stats?.cpu_stats?.cpu_usage?.total_usage || 0) -
		Number(stats?.precpu_stats?.cpu_usage?.total_usage || 0);
	const systemDelta =
		Number(stats?.cpu_stats?.system_cpu_usage || 0) -
		Number(stats?.precpu_stats?.system_cpu_usage || 0);
	const onlineCpus =
		Number(stats?.cpu_stats?.online_cpus || 0) ||
		Number(stats?.cpu_stats?.cpu_usage?.percpu_usage?.length || 0) ||
		1;

	if (cpuDelta <= 0 || systemDelta <= 0) {
		return 0;
	}

	return Number((((cpuDelta / systemDelta) * onlineCpus * 100) || 0).toFixed(1));
}

function computeMemoryUsageBytes(stats) {
	const usage = Number(stats?.memory_stats?.usage || 0);
	const memoryStats = stats?.memory_stats?.stats || {};
	const cache =
		Number(memoryStats?.inactive_file || 0) ||
		Number(memoryStats?.total_inactive_file || 0) ||
		Number(memoryStats?.cache || 0);
	return Math.max(0, usage - cache);
}

function computeNetworkTotals(stats) {
	const networks = stats?.networks || {};
	let rxBytes = 0;
	let txBytes = 0;
	for (const network of Object.values(networks)) {
		rxBytes += Number(network?.rx_bytes || 0);
		txBytes += Number(network?.tx_bytes || 0);
	}
	return { rxBytes, txBytes };
}

function computeBlockIoTotals(stats) {
	const rows = Array.isArray(stats?.blkio_stats?.io_service_bytes_recursive)
		? stats.blkio_stats.io_service_bytes_recursive
		: [];
	let readBytes = 0;
	let writeBytes = 0;
	for (const row of rows) {
		const op = String(row?.op || "").toLowerCase();
		const value = Number(row?.value || 0);
		if (op === "read") {
			readBytes += value;
		} else if (op === "write") {
			writeBytes += value;
		}
	}
	return { readBytes, writeBytes };
}

function formatBytesBinary(value) {
	const bytes = Number(value || 0);
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return "0B";
	}

	const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
	let unitIndex = 0;
	let amount = bytes;
	while (amount >= 1024 && unitIndex < units.length - 1) {
		amount /= 1024;
		unitIndex += 1;
	}
	const precision = amount >= 10 || unitIndex === 0 ? 0 : 1;
	return `${amount.toFixed(precision)}${units[unitIndex]}`;
}

function parsePercentString(value) {
	const parsed = Number.parseFloat(String(value || "").replace("%", ""));
	return Number.isFinite(parsed) ? parsed : 0;
}
