import { randomUUID } from "node:crypto";
import { collectDockerEngineSnapshot } from "./docker-engine-snapshot.mjs";
import { getMetricsRoom } from "../socket/metrics-room.mjs";

const RESOURCE_COUNTS_INTERVAL_MS = 2_000;
const LOCAL_SAMPLE_INTERVAL_MS = 15_000;
const BROADCAST_THROTTLE_MS = 2_000;
const LOCAL_ENVIRONMENT_KEY = "local";
const SNAPSHOT_STALE_AFTER_MS = 5_000;

export function createRuntimeMetricsService({
	io,
	sql,
	getSocketRuntimeMetrics,
	isShuttingDown,
}) {
	let lastLocalMetricsPersistAt = 0;
	let collectionTimer = null;
	let collectionInFlight = null;
	let latestContainerStats = [];
	let latestResourceCounts = null;
	let lastResourceCountsFetchAt = 0;
	let subscriberCount = 0;
	let broadcastTimer = null;
	let broadcastPending = false;
	let latestRuntimeSnapshot = null;
	let latestRuntimeSnapshotAt = 0;

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

	async function collectCurrentSnapshot(options = {}) {
		const maxAgeMs =
			Number.isFinite(options.maxAgeMs) && Number(options.maxAgeMs) > 0
				? Number(options.maxAgeMs)
				: SNAPSHOT_STALE_AFTER_MS;
		if (!options.force && latestRuntimeSnapshot && Date.now() - latestRuntimeSnapshotAt <= maxAgeMs) {
			return latestRuntimeSnapshot;
		}

		if (collectionInFlight) {
			return collectionInFlight;
		}

		collectionInFlight = (async () => {
			const snapshot = await collectDockerEngineSnapshot();
			latestRuntimeSnapshot = snapshot;
			latestRuntimeSnapshotAt = Date.now();
			latestContainerStats = Array.isArray(snapshot.containerStats) ? snapshot.containerStats : [];
			latestResourceCounts = {
				containerRows: Array.isArray(snapshot.containers) ? snapshot.containers : [],
				imageRows: Array.isArray(snapshot.images) ? snapshot.images : [],
				volumeRows: Array.isArray(snapshot.volumes) ? snapshot.volumes : [],
				networkRows: Array.isArray(snapshot.networks) ? snapshot.networks : [],
				dockerVersion: snapshot.host?.dockerVersion || "unknown",
				counts: {
					containers: Number(snapshot.counts?.containers || 0),
					runningContainers: Number(snapshot.counts?.runningContainers || 0),
					images: Number(snapshot.counts?.images || 0),
					volumes: Number(snapshot.counts?.volumes || 0),
					networks: Number(snapshot.counts?.networks || 0),
				},
			};
			lastResourceCountsFetchAt = latestRuntimeSnapshotAt;
			return snapshot;
		})().finally(() => {
			collectionInFlight = null;
		});

		return collectionInFlight;
	}

	function scheduleCollection(delayMs = subscriberCount > 0 ? RESOURCE_COUNTS_INTERVAL_MS : LOCAL_SAMPLE_INTERVAL_MS) {
		if (isShuttingDown()) {
			return;
		}
		if (collectionTimer) {
			clearTimeout(collectionTimer);
		}
		collectionTimer = setTimeout(async () => {
			collectionTimer = null;
			try {
				await collectCurrentSnapshot({ force: true });
				if (subscriberCount > 0) {
					scheduleBroadcast();
				}
			} catch {
				// Keep the last known snapshot if collection fails.
			} finally {
				scheduleCollection();
			}
		}, Math.max(delayMs, 250));
		collectionTimer.unref?.();
	}

	function startDockerStatsStream() {
		if (collectionTimer || collectionInFlight) {
			return;
		}
		void collectCurrentSnapshot({ force: true })
			.catch(() => {
				// Collector will retry on the next schedule.
			})
			.finally(() => {
				scheduleCollection();
			});
	}

	function stopDockerStatsStream() {
		collectionInFlight = null;
		if (collectionTimer) {
			clearTimeout(collectionTimer);
			collectionTimer = null;
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
		socket.join(getMetricsRoom(LOCAL_ENVIRONMENT_KEY));
		subscriberCount += 1;
		if (subscriberCount === 1) {
			scheduleCollection(0);
		}
	}

	function removeMetricsSubscriber(socket) {
		socket.leave(getMetricsRoom(LOCAL_ENVIRONMENT_KEY));
		subscriberCount = Math.max(0, subscriberCount - 1);
		if (subscriberCount === 0) {
			scheduleCollection(LOCAL_SAMPLE_INTERVAL_MS);
		}
	}

	async function refreshResourceCounts() {
		const now = Date.now();
		if (latestResourceCounts && now - lastResourceCountsFetchAt < RESOURCE_COUNTS_INTERVAL_MS) {
			return latestResourceCounts;
		}

		try {
			await collectCurrentSnapshot({ force: true });
		} catch {
			// Keep stale counts if Docker CLI fails.
		}

		return latestResourceCounts;
	}

	function updateLatestRuntimeSnapshot(snapshot) {
		latestRuntimeSnapshot = snapshot;
		latestRuntimeSnapshotAt = Date.now();
		latestContainerStats = Array.isArray(snapshot?.containerStats) ? snapshot.containerStats : [];
	}

	async function broadcastMetrics() {
		if (subscriberCount <= 0) {
			void persistLocalRuntimeSamples({ containers: latestContainerStats, host: null });
			return;
		}

		await refreshResourceCounts();
		const snapshot = await collectCurrentSnapshot();
		updateLatestRuntimeSnapshot(snapshot);
		const netDeltas = computeNetDeltas(snapshot.containerStats);

		const ws = getSocketRuntimeMetrics();

		io.to(getMetricsRoom(LOCAL_ENVIRONMENT_KEY)).emit("runtime:metrics", {
			environmentId: LOCAL_ENVIRONMENT_KEY,
			at: Date.now(),
			containers: snapshot.containerStats,
			host: {
				source: "native",
				cpuPercent: snapshot.usage?.cpuPercent ?? null,
				memoryPercent: snapshot.usage?.memoryPercent ?? null,
			},
			ws,
			netDeltas,
		});

		void persistLocalRuntimeSamples({
			containers: snapshot.containerStats,
			host: {
				source: "native",
				cpuPercent: snapshot.usage?.cpuPercent ?? null,
				memoryPercent: snapshot.usage?.memoryPercent ?? null,
				hostname: snapshot.host.hostname,
				platform: snapshot.host.platform,
				architecture: snapshot.host.architecture,
				dockerVersion: snapshot.host.dockerVersion,
				cpus: snapshot.host.cpus,
				totalMemoryGb: snapshot.host.totalMemoryGb,
				freeMemoryGb: snapshot.host.freeMemoryGb,
				counts: snapshot.counts,
				containerRows: snapshot.containers,
			},
			containerRows: snapshot.containers,
		});
	}

	async function getRuntimeMetrics() {
		await refreshResourceCounts();
		const snapshot = await collectCurrentSnapshot();
		updateLatestRuntimeSnapshot(snapshot);
		return {
			containers: snapshot.containerStats,
			host: {
				source: "native",
				cpuPercent: snapshot.usage?.cpuPercent ?? null,
				memoryPercent: snapshot.usage?.memoryPercent ?? null,
				hostname: snapshot.host.hostname,
				platform: snapshot.host.platform,
				architecture: snapshot.host.architecture,
				dockerVersion: snapshot.host.dockerVersion,
				cpus: snapshot.host.cpus,
				totalMemoryGb: snapshot.host.totalMemoryGb,
				freeMemoryGb: snapshot.host.freeMemoryGb,
				counts: snapshot.counts,
				containerRows: snapshot.containers,
			},
			snapshot,
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

	function getLatestRuntimeSnapshot(maxAgeMs = 30_000) {
		if (!latestRuntimeSnapshot || !latestRuntimeSnapshotAt) {
			return null;
		}
		if (Date.now() - latestRuntimeSnapshotAt > maxAgeMs) {
			return null;
		}
		return {
			snapshot: latestRuntimeSnapshot,
			sampledAt: latestRuntimeSnapshotAt,
		};
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
		getLatestRuntimeSnapshot,
		setLatestRuntimeSnapshot: (snapshot, sampledAt = Date.now()) => {
			latestRuntimeSnapshot = snapshot;
			latestRuntimeSnapshotAt = sampledAt;
		},
		localSampleIntervalMs: LOCAL_SAMPLE_INTERVAL_MS,
		resourceCountsIntervalMs: RESOURCE_COUNTS_INTERVAL_MS,
		startDockerStatsStream,
		stopDockerStatsStream,
		addMetricsSubscriber,
		removeMetricsSubscriber,
		metricsRoom: getMetricsRoom(LOCAL_ENVIRONMENT_KEY),
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
