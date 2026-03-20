import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";

const RESOURCE_COUNTS_INTERVAL_MS = 30_000;
const LOCAL_SAMPLE_INTERVAL_MS = 15_000;
const BROADCAST_THROTTLE_MS = 2_000;
const METRICS_ROOM = "metrics:local";

export function createRuntimeMetricsService({
	io,
	sql,
	dockerBinary,
	execFileAsync,
	isPrivilegedRole,
	getSocketRuntimeMetrics,
	isShuttingDown,
}) {
	let lastLocalMetricsPersistAt = 0;
	let dockerStatsProcess = null;
	let latestContainerStats = [];
	let latestResourceCounts = null;
	let lastResourceCountsFetchAt = 0;
	let subscriberCount = 0;
	let broadcastTimer = null;
	let broadcastPending = false;

	// --- Delta tracking for network I/O ---
	const prevNetIo = new Map();

	function computeNetDeltas(statsRows) {
		const now = Date.now();
		const result = [];
		for (const row of statsRows) {
			const name = String(row.Name || row.ID || "").replace(/^\//, "");
			const netIo = parseNetIo(row.NetIO);
			const prev = prevNetIo.get(name);
			let rxPerSec = 0;
			let txPerSec = 0;
			if (prev && netIo.rxBytesTotal !== null && netIo.txBytesTotal !== null) {
				const elapsedSec = Math.max((now - prev.at) / 1000, 1);
				rxPerSec = Math.max(0, (netIo.rxBytesTotal - prev.rx) / elapsedSec);
				txPerSec = Math.max(0, (netIo.txBytesTotal - prev.tx) / elapsedSec);
			}
			if (netIo.rxBytesTotal !== null && netIo.txBytesTotal !== null) {
				prevNetIo.set(name, {
					rx: netIo.rxBytesTotal,
					tx: netIo.txBytesTotal,
					at: now,
				});
			}
			result.push({
				name,
				rxPerSec: Math.round(rxPerSec),
				txPerSec: Math.round(txPerSec),
			});
		}
		return result;
	}

	function startDockerStatsStream() {
		if (dockerStatsProcess) {
			return;
		}

		const args = ["stats", "--format", "{{json .}}", "--no-trunc"];
		const process = spawn(dockerBinary, args, {
			stdio: ["ignore", "pipe", "ignore"],
		});
		dockerStatsProcess = process;

		let buffer = "";
		process.stdout.on("data", (chunk) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			const rows = [];
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) {
					continue;
				}

				try {
					rows.push(JSON.parse(trimmed));
				} catch {
					// Skip malformed lines.
				}
			}

			if (rows.length > 0) {
				latestContainerStats = rows;
				scheduleBroadcast();
			}
		});

		process.on("exit", () => {
			dockerStatsProcess = null;
			if (!isShuttingDown()) {
				setTimeout(() => startDockerStatsStream(), 3_000);
			}
		});

		process.on("error", () => {
			dockerStatsProcess = null;
			if (!isShuttingDown()) {
				setTimeout(() => startDockerStatsStream(), 5_000);
			}
		});
	}

	function stopDockerStatsStream() {
		if (dockerStatsProcess) {
			dockerStatsProcess.kill("SIGTERM");
			dockerStatsProcess = null;
		}
		if (broadcastTimer) {
			clearTimeout(broadcastTimer);
			broadcastTimer = null;
		}
	}

	function scheduleBroadcast() {
		if (subscriberCount <= 0) {
			return;
		}
		broadcastPending = true;
		if (!broadcastTimer) {
			broadcastTimer = setTimeout(() => {
				broadcastTimer = null;
				if (broadcastPending) {
					broadcastPending = false;
					void broadcastMetrics();
				}
			}, BROADCAST_THROTTLE_MS);
			broadcastTimer.unref?.();
		}
	}

	function addMetricsSubscriber(socket) {
		socket.join(METRICS_ROOM);
		subscriberCount += 1;
	}

	function removeMetricsSubscriber(socket) {
		socket.leave(METRICS_ROOM);
		subscriberCount = Math.max(0, subscriberCount - 1);
	}

	async function refreshResourceCounts() {
		const now = Date.now();
		if (latestResourceCounts && now - lastResourceCountsFetchAt < RESOURCE_COUNTS_INTERVAL_MS) {
			return latestResourceCounts;
		}

		try {
			const [psResult, imagesResult, volumesResult, networksResult, versionResult] = await Promise.all([
				execFileAsync(dockerBinary, ["ps", "-a", "--format", "{{json .}}"], {
					maxBuffer: 1024 * 1024 * 8,
				}),
				execFileAsync(dockerBinary, ["images", "--digests", "--format", "{{json .}}"], {
					maxBuffer: 1024 * 1024 * 8,
				}),
				execFileAsync(dockerBinary, ["volume", "ls", "--format", "{{json .}}"], {
					maxBuffer: 1024 * 1024 * 4,
				}),
				execFileAsync(dockerBinary, ["network", "ls", "--format", "{{json .}}"], {
					maxBuffer: 1024 * 1024 * 4,
				}),
				execFileAsync(dockerBinary, ["version", "--format", "{{.Server.Version}}"], {
					maxBuffer: 1024 * 256,
				}),
			]);

			const containers = parseJsonLines(psResult.stdout);
			const images = parseJsonLines(imagesResult.stdout);
			const volumes = parseJsonLines(volumesResult.stdout);
			const networks = parseJsonLines(networksResult.stdout);

			latestResourceCounts = {
				containerRows: containers,
				dockerVersion: versionResult.stdout.trim() || "unknown",
				counts: {
					containers: containers.length,
					runningContainers: containers.filter((row) => row.State === "running").length,
					images: images.length,
					volumes: volumes.length,
					networks: networks.length,
				},
			};
			lastResourceCountsFetchAt = now;
		} catch {
			// Keep stale counts if Docker CLI fails.
		}

		return latestResourceCounts;
	}

	async function broadcastMetrics() {
		if (subscriberCount <= 0) {
			void persistLocalRuntimeSamples({ containers: latestContainerStats, host: null });
			return;
		}

		const statsRows = latestContainerStats;
		const resourceCounts = await refreshResourceCounts();
		const netDeltas = computeNetDeltas(statsRows);

		const cpuPercent = clampPercent(statsRows.reduce((sum, row) => sum + (parsePercent(row.CPUPerc) || 0), 0));
		const memoryPercent = clampPercent(
			statsRows.reduce((sum, row) => sum + (parsePercent(row.MemPerc) || 0), 0),
		);

		const host = {
			source: "native",
			cpuPercent,
			memoryPercent,
			hostname: os.hostname(),
			platform: `${os.platform()} ${os.release()}`,
			architecture: os.arch(),
			dockerVersion: resourceCounts?.dockerVersion || "unknown",
			cpus: os.cpus().length,
			totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
			freeMemoryGb: Number((os.freemem() / 1024 / 1024 / 1024).toFixed(1)),
			counts: resourceCounts?.counts || { containers: 0, runningContainers: 0, images: 0, volumes: 0, networks: 0 },
			containerRows: resourceCounts?.containerRows || [],
		};

		const ws = getSocketRuntimeMetrics();

		io.to(METRICS_ROOM).emit("runtime:metrics", {
			environmentId: "local",
			at: Date.now(),
			containers: statsRows,
			host,
			ws,
			netDeltas,
		});

		void persistLocalRuntimeSamples({ containers: statsRows, host, containerRows: resourceCounts?.containerRows });
	}

	async function getRuntimeMetrics() {
		const statsRows = latestContainerStats;
		const resourceCounts = await refreshResourceCounts();

		const cpuPercent = clampPercent(statsRows.reduce((sum, row) => sum + (parsePercent(row.CPUPerc) || 0), 0));
		const memoryPercent = clampPercent(
			statsRows.reduce((sum, row) => sum + (parsePercent(row.MemPerc) || 0), 0),
		);

		return {
			containers: statsRows,
			host: {
				source: "native",
				cpuPercent,
				memoryPercent,
				hostname: os.hostname(),
				platform: `${os.platform()} ${os.release()}`,
				architecture: os.arch(),
				dockerVersion: resourceCounts?.dockerVersion || "unknown",
				cpus: os.cpus().length,
				totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
				freeMemoryGb: Number((os.freemem() / 1024 / 1024 / 1024).toFixed(1)),
				counts: resourceCounts?.counts || { containers: 0, runningContainers: 0, images: 0, volumes: 0, networks: 0 },
				containerRows: resourceCounts?.containerRows || [],
			},
		};
	}

	async function persistCurrentMetrics() {
		const metrics = await getRuntimeMetrics();
		await persistLocalRuntimeSamples({
			containers: metrics.containers,
			host: metrics.host,
			containerRows: metrics.host?.containerRows,
		});
	}

	async function persistLocalRuntimeSamples(metrics) {
		if (!metrics?.host) {
			return;
		}

		const now = Date.now();
		if (now - lastLocalMetricsPersistAt < 15_000) {
			return;
		}
		lastLocalMetricsPersistAt = now;

		try {
			const sampledAt = new Date(now);
			const createdAt = sampledAt;
			const localEnvironments = await sql`
				select id
				from environments
				where kind = 'local'
			`;

			if (!localEnvironments.length) {
				return;
			}

			const memoryTotalBytes = Math.round((metrics.host.totalMemoryGb || 0) * 1024 * 1024 * 1024);
			const memoryUsedBytes = Math.max(
				0,
				memoryTotalBytes - Math.round((metrics.host.freeMemoryGb || 0) * 1024 * 1024 * 1024),
			);

			for (const environment of localEnvironments) {
				const sampleId = randomUUID();
				await sql`
					insert into environment_metric_samples (
						id,
						environment_id,
						source,
						hostname,
						cpu_percent_tenths,
						memory_percent_tenths,
						memory_used_bytes,
						memory_total_bytes,
						container_count,
						running_container_count,
						image_count,
						volume_count,
						network_count,
						sampled_at,
						created_at
					) values (
						${sampleId},
						${environment.id},
						${"native"},
						${metrics.host.hostname || null},
						${toTenths(metrics.host.cpuPercent)},
						${toTenths(metrics.host.memoryPercent)},
						${memoryUsedBytes || null},
						${memoryTotalBytes || null},
						${metrics.host.counts?.containers || 0},
						${metrics.host.counts?.runningContainers || 0},
						${metrics.host.counts?.images || 0},
						${metrics.host.counts?.volumes || 0},
						${metrics.host.counts?.networks || 0},
						${sampledAt},
						${createdAt}
					)
				`;

				for (const statsRow of metrics.containers || []) {
					const memory = parseMemoryUsage(statsRow.MemUsage);
					const netIo = parseNetIo(statsRow.NetIO);
					const containerName = String(statsRow.Name || statsRow.ID || "").replace(/^\//, "");
					const containerRow =
						(metrics.containerRows || []).find(
							(row) => row.ID === statsRow.ID || String(row.Names || "").replace(/^\//, "") === containerName,
						) || {};
					await sql`
						insert into container_metric_samples (
							id,
							environment_id,
							container_id,
							container_name,
							image,
							state,
							cpu_percent_tenths,
							memory_usage_bytes,
							memory_limit_bytes,
							memory_percent_tenths,
							rx_bytes_total,
							tx_bytes_total,
							sampled_at,
							created_at
						) values (
							${randomUUID()},
							${environment.id},
							${String(statsRow.ID || "")},
							${containerName || "unknown"},
							${String(containerRow.Image || "")},
							${String(containerRow.State || "")},
							${toTenths(parsePercent(statsRow.CPUPerc))},
							${memory.usageBytes},
							${memory.limitBytes},
							${toTenths(parsePercent(statsRow.MemPerc))},
							${netIo.rxBytesTotal},
							${netIo.txBytesTotal},
							${sampledAt},
							${createdAt}
						)
					`;
				}
			}

			const cutoff = new Date(now - 24 * 60 * 60 * 1000);
			await sql`delete from environment_metric_samples where sampled_at < ${cutoff}`;
			await sql`delete from container_metric_samples where sampled_at < ${cutoff}`;
		} catch (error) {
			console.error("[runtime:metrics] failed to persist local samples:", error?.message || error);
		}
	}

	return {
		broadcastMetrics,
		getRuntimeMetrics,
		persistCurrentMetrics,
		refreshResourceCounts,
		localSampleIntervalMs: LOCAL_SAMPLE_INTERVAL_MS,
		resourceCountsIntervalMs: RESOURCE_COUNTS_INTERVAL_MS,
		startDockerStatsStream,
		stopDockerStatsStream,
		addMetricsSubscriber,
		removeMetricsSubscriber,
		metricsRoom: METRICS_ROOM,
	};
}

function clampPercent(value) {
	if (!Number.isFinite(value)) {
		return null;
	}

	return Math.max(0, Math.min(100, Number(value)));
}

function parseJsonLines(content) {
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line)];
			} catch {
				return [];
			}
		});
}

function parsePercent(value) {
	const parsed = Number.parseFloat(String(value || "").replace("%", "").trim());
	return Number.isFinite(parsed) ? parsed : null;
}

function parseHumanBytes(value) {
	const raw = String(value || "").trim();
	if (!raw) {
		return null;
	}

	const match = raw.match(/^([\d.]+)\s*([A-Za-z]+)?$/);
	if (!match) {
		return null;
	}

	const amount = Number.parseFloat(match[1]);
	if (!Number.isFinite(amount)) {
		return null;
	}

	const unit = (match[2] || "B").toUpperCase();
	const multipliers = {
		B: 1,
		KB: 1000,
		KIB: 1024,
		MB: 1000 ** 2,
		MIB: 1024 ** 2,
		GB: 1000 ** 3,
		GIB: 1024 ** 3,
		TB: 1000 ** 4,
		TIB: 1024 ** 4,
		PB: 1000 ** 5,
		PIB: 1024 ** 5,
	};
	const multiplier = multipliers[unit] || multipliers[unit.replace(/S$/, "")];
	return multiplier ? Math.round(amount * multiplier) : null;
}

function parseMemoryUsage(value) {
	const [usage, limit] = String(value || "")
		.split("/")
		.map((part) => part.trim());

	return {
		usageBytes: parseHumanBytes(usage),
		limitBytes: parseHumanBytes(limit),
	};
}

function parseNetIo(value) {
	const [rx, tx] = String(value || "")
		.split("/")
		.map((part) => part.trim());

	return {
		rxBytesTotal: parseHumanBytes(rx),
		txBytesTotal: parseHumanBytes(tx),
	};
}

function toTenths(value) {
	if (!Number.isFinite(value)) {
		return null;
	}
	return Math.round(Number(value) * 10);
}
