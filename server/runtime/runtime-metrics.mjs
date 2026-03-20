import { randomUUID } from "node:crypto";
import { collectDockerEngineSnapshot } from "./docker-engine-snapshot.mjs";

const COLLECTION_INTERVAL_MS = 2_000;
const PERSIST_INTERVAL_MS = 15_000;
const SNAPSHOT_STALE_AFTER_MS = 5_000;

/**
 * Environment-level runtime metrics service.
 *
 * Responsibilities:
 * - Periodically collect Docker engine snapshots (containers, images, host info)
 * - Broadcast environment-level metrics to dashboard subscribers via Socket.IO rooms
 * - Persist environment + container metric samples to DB every 15s
 *
 * Per-container real-time stats are handled separately by container-stats-stream.mjs.
 */
export function createRuntimeMetricsService({
	io,
	sql,
	getSocketRuntimeMetrics,
	isShuttingDown,
}) {
	let lastPersistAt = 0;
	let collectionTimer = null;
	let collectionInFlight = null;
	let latestSnapshot = null;
	let latestSnapshotAt = 0;
	let subscriberCount = 0;

	async function collectCurrentSnapshot(options = {}) {
		const maxAgeMs =
			Number.isFinite(options.maxAgeMs) && Number(options.maxAgeMs) > 0
				? Number(options.maxAgeMs)
				: SNAPSHOT_STALE_AFTER_MS;
		if (!options.force && latestSnapshot && Date.now() - latestSnapshotAt <= maxAgeMs) {
			return latestSnapshot;
		}

		if (collectionInFlight) {
			return collectionInFlight;
		}

		collectionInFlight = (async () => {
			const snapshot = await collectDockerEngineSnapshot();
			latestSnapshot = snapshot;
			latestSnapshotAt = Date.now();
			return snapshot;
		})().finally(() => {
			collectionInFlight = null;
		});

		return collectionInFlight;
	}

	function scheduleCollection() {
		if (isShuttingDown()) return;
		if (collectionTimer) {
			clearTimeout(collectionTimer);
		}
		const delay = subscriberCount > 0 ? COLLECTION_INTERVAL_MS : PERSIST_INTERVAL_MS;
		collectionTimer = setTimeout(async () => {
			collectionTimer = null;
			try {
				const snapshot = await collectCurrentSnapshot({ force: true });
				if (subscriberCount > 0) {
					broadcastEnvironmentMetrics(snapshot);
				}
				await persistSamples(snapshot);
			} catch {
				// Keep the last known snapshot if collection fails
			} finally {
				scheduleCollection();
			}
		}, Math.max(delay, 250));
		collectionTimer.unref?.();
	}

	function broadcastEnvironmentMetrics(snapshot) {
		if (subscriberCount <= 0) return;

		const ws = getSocketRuntimeMetrics();
		io.to("metrics:env:local").emit("runtime:metrics", {
			environmentId: "local",
			at: Date.now(),
			host: {
				source: "native",
				cpuPercent: snapshot.usage?.cpuPercent ?? null,
				memoryPercent: snapshot.usage?.memoryPercent ?? null,
			},
			ws,
		});
	}

	function addMetricsSubscriber(socket) {
		socket.join("metrics:env:local");
		subscriberCount += 1;
		if (subscriberCount === 1) {
			scheduleCollection();
		}
	}

	function removeMetricsSubscriber(socket) {
		socket.leave("metrics:env:local");
		subscriberCount = Math.max(0, subscriberCount - 1);
	}

	function startDockerStatsStream() {
		if (collectionTimer || collectionInFlight) return;
		void collectCurrentSnapshot({ force: true })
			.catch(() => {})
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
	}

	async function persistSamples(snapshot) {
		if (!snapshot?.host) return;
		const now = Date.now();
		if (now - lastPersistAt < PERSIST_INTERVAL_MS) return;
		lastPersistAt = now;

		try {
			const sampledAt = new Date(now);
			const localEnvironments = await sql`
				select id from environments where kind = 'local'
			`;
			if (!localEnvironments.length) return;

			const memoryTotalBytes = Math.round((snapshot.host.totalMemoryGb || 0) * 1024 * 1024 * 1024);
			const memoryUsedBytes = Math.max(
				0,
				memoryTotalBytes - Math.round((snapshot.host.freeMemoryGb || 0) * 1024 * 1024 * 1024),
			);

			for (const environment of localEnvironments) {
				await sql`
					insert into environment_metric_samples (
						id, environment_id, source, hostname,
						cpu_percent_tenths, memory_percent_tenths,
						memory_used_bytes, memory_total_bytes,
						container_count, running_container_count,
						image_count, volume_count, network_count,
						sampled_at, created_at
					) values (
						${randomUUID()}, ${environment.id}, ${"native"},
						${snapshot.host.hostname || null},
						${toTenths(snapshot.usage?.cpuPercent)},
						${toTenths(snapshot.usage?.memoryPercent)},
						${memoryUsedBytes || null}, ${memoryTotalBytes || null},
						${snapshot.counts?.containers || 0},
						${snapshot.counts?.runningContainers || 0},
						${snapshot.counts?.images || 0},
						${snapshot.counts?.volumes || 0},
						${snapshot.counts?.networks || 0},
						${sampledAt}, ${sampledAt}
					)
				`;

				for (const statsRow of snapshot.containerStats || []) {
					const containerName = String(statsRow.Name || statsRow.ID || "").replace(/^\//, "");
					const memUsageBytes = parseNumericBytes(statsRow.MemUsage);
					const memLimitBytes = parseNumericLimit(statsRow.MemUsage);
					const rxBytes = parseNumericBytes(statsRow.NetIO);
					const txBytes = parseNumericLimit(statsRow.NetIO);

					await sql`
						insert into container_metric_samples (
							id, environment_id, container_id, container_name,
							image, state,
							cpu_percent_tenths, memory_usage_bytes, memory_limit_bytes,
							memory_percent_tenths, rx_bytes_total, tx_bytes_total,
							sampled_at, created_at
						) values (
							${randomUUID()}, ${environment.id},
							${String(statsRow.ID || "")}, ${containerName || "unknown"},
							${findContainerImage(snapshot.containers, statsRow)},
							${findContainerState(snapshot.containers, statsRow)},
							${toTenths(parsePercent(statsRow.CPUPerc))},
							${memUsageBytes}, ${memLimitBytes},
							${toTenths(parsePercent(statsRow.MemPerc))},
							${rxBytes}, ${txBytes},
							${sampledAt}, ${sampledAt}
						)
					`;
				}
			}

			const cutoff = new Date(now - 24 * 60 * 60 * 1000);
			await sql`delete from environment_metric_samples where sampled_at < ${cutoff}`;
			await sql`delete from container_metric_samples where sampled_at < ${cutoff}`;
		} catch (error) {
			console.error("[runtime:metrics] failed to persist samples:", error?.message || error);
		}
	}

	async function refreshResourceCounts() {
		try {
			await collectCurrentSnapshot({ force: true });
		} catch {
			// Keep stale counts if Docker API fails
		}
		return latestSnapshot
			? {
					containerRows: Array.isArray(latestSnapshot.containers) ? latestSnapshot.containers : [],
					imageRows: Array.isArray(latestSnapshot.images) ? latestSnapshot.images : [],
					volumeRows: Array.isArray(latestSnapshot.volumes) ? latestSnapshot.volumes : [],
					networkRows: Array.isArray(latestSnapshot.networks) ? latestSnapshot.networks : [],
					dockerVersion: latestSnapshot.host?.dockerVersion || "unknown",
					counts: latestSnapshot.counts || {},
				}
			: null;
	}

	async function getRuntimeMetrics() {
		const snapshot = await collectCurrentSnapshot();
		return {
			containers: snapshot?.containerStats || [],
			host: {
				source: "native",
				cpuPercent: snapshot?.usage?.cpuPercent ?? null,
				memoryPercent: snapshot?.usage?.memoryPercent ?? null,
				hostname: snapshot?.host?.hostname,
				platform: snapshot?.host?.platform,
				architecture: snapshot?.host?.architecture,
				dockerVersion: snapshot?.host?.dockerVersion,
				cpus: snapshot?.host?.cpus,
				totalMemoryGb: snapshot?.host?.totalMemoryGb,
				freeMemoryGb: snapshot?.host?.freeMemoryGb,
				counts: snapshot?.counts,
				containerRows: snapshot?.containers,
			},
			snapshot,
		};
	}

	async function persistCurrentMetrics() {
		const snapshot = await collectCurrentSnapshot({ force: true });
		if (snapshot) {
			await persistSamples(snapshot);
		}
	}

	function getLatestRuntimeSnapshot(maxAgeMs = 30_000) {
		if (!latestSnapshot || !latestSnapshotAt) return null;
		if (Date.now() - latestSnapshotAt > maxAgeMs) return null;
		return { snapshot: latestSnapshot, sampledAt: latestSnapshotAt };
	}

	return {
		getRuntimeMetrics,
		persistCurrentMetrics,
		refreshResourceCounts,
		getLatestRuntimeSnapshot,
		setLatestRuntimeSnapshot: (snapshot, sampledAt = Date.now()) => {
			latestSnapshot = snapshot;
			latestSnapshotAt = sampledAt;
		},
		startDockerStatsStream,
		stopDockerStatsStream,
		addMetricsSubscriber,
		removeMetricsSubscriber,
		persistIntervalMs: PERSIST_INTERVAL_MS,
		collectionIntervalMs: COLLECTION_INTERVAL_MS,
	};
}

function toTenths(value) {
	if (!Number.isFinite(value)) return null;
	return Math.round(Number(value) * 10);
}

function parsePercent(value) {
	const parsed = Number.parseFloat(String(value || "").replace("%", "").trim());
	return Number.isFinite(parsed) ? parsed : null;
}

function parseHumanBytes(value) {
	const raw = String(value || "").trim();
	if (!raw) return null;
	const match = raw.match(/^([\d.]+)\s*([A-Za-z]+)?$/);
	if (!match) return null;
	const amount = Number.parseFloat(match[1]);
	if (!Number.isFinite(amount)) return null;
	const unit = (match[2] || "B").toUpperCase();
	const multipliers = {
		B: 1, KB: 1000, KIB: 1024,
		MB: 1000 ** 2, MIB: 1024 ** 2,
		GB: 1000 ** 3, GIB: 1024 ** 3,
		TB: 1000 ** 4, TIB: 1024 ** 4,
	};
	const multiplier = multipliers[unit] || multipliers[unit.replace(/S$/, "")];
	return multiplier ? Math.round(amount * multiplier) : null;
}

function parseNumericBytes(value) {
	const parts = String(value || "").split("/");
	return parseHumanBytes(parts[0]?.trim());
}

function parseNumericLimit(value) {
	const parts = String(value || "").split("/");
	return parts.length > 1 ? parseHumanBytes(parts[1]?.trim()) : null;
}

function findContainerImage(containers, statsRow) {
	if (!Array.isArray(containers)) return "";
	const name = String(statsRow.Name || "").replace(/^\//, "");
	const match = containers.find(
		(c) => c.ID === statsRow.ID || String(c.Names || "").replace(/^\//, "") === name,
	);
	return String(match?.Image || "");
}

function findContainerState(containers, statsRow) {
	if (!Array.isArray(containers)) return "";
	const name = String(statsRow.Name || "").replace(/^\//, "");
	const match = containers.find(
		(c) => c.ID === statsRow.ID || String(c.Names || "").replace(/^\//, "") === name,
	);
	return String(match?.State || "");
}
