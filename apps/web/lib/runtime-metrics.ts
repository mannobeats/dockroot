import "server-only";

import { randomUUID } from "node:crypto";
import { containerMetricSamples, db, environmentMetricSamples } from "@dockroot/db";
import { and, asc, desc, eq, gte, lt, or } from "drizzle-orm";

type RuntimeStatsRow = Record<string, string>;
type RuntimeContainerRow = Record<string, string>;

type RuntimeSnapshotPayload = {
	host: {
		hostname?: string | null;
		totalMemoryGb?: number | null;
		freeMemoryGb?: number | null;
	};
	counts?: {
		containers?: number;
		runningContainers?: number;
		images?: number;
		volumes?: number;
		networks?: number;
	};
	usage?: {
		cpuPercent?: number | null;
		memoryPercent?: number | null;
	};
	containers?: RuntimeContainerRow[];
	containerStats?: RuntimeStatsRow[];
};

function addMinutes(date: Date, minutes: number) {
	return new Date(date.getTime() + minutes * 60_000);
}

function formatTimelineTime(date: Date) {
	return date.toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

function parsePercent(value: string | null | undefined) {
	const parsed = Number.parseFloat(
		String(value || "")
			.replace("%", "")
			.trim(),
	);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseHumanBytes(value: string | null | undefined) {
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
	const multipliers: Record<string, number> = {
		B: 1,
		BYTE: 1,
		BYTES: 1,
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

	const multiplier = multipliers[unit] ?? multipliers[unit.replace(/S$/, "")];
	if (!multiplier) {
		return null;
	}

	return Math.round(amount * multiplier);
}

function parseMemoryUsage(value: string | null | undefined) {
	const [usage, limit] = String(value || "")
		.split("/")
		.map((part) => part.trim());

	return {
		usageBytes: parseHumanBytes(usage),
		limitBytes: parseHumanBytes(limit),
	};
}

function parseNetIo(value: string | null | undefined) {
	const [rx, tx] = String(value || "")
		.split("/")
		.map((part) => part.trim());

	return {
		rxBytesTotal: parseHumanBytes(rx),
		txBytesTotal: parseHumanBytes(tx),
	};
}

function toTenths(value: number | null | undefined) {
	if (!Number.isFinite(value)) {
		return null;
	}
	return Math.round(Number(value) * 10);
}

function fromTenths(value: number | null | undefined) {
	if (!Number.isFinite(value)) {
		return null;
	}
	return Number(value) / 10;
}

function pickContainerName(row: RuntimeContainerRow, statsRow?: RuntimeStatsRow) {
	return (
		String(row.Names || row.Name || statsRow?.Name || row.ID || statsRow?.ID || "").replace(
			/^\//,
			"",
		) || "unknown"
	);
}

function buildContainerMetricsRows(snapshot: RuntimeSnapshotPayload, sampledAt: Date) {
	const statsRows = Array.isArray(snapshot.containerStats) ? snapshot.containerStats : [];
	const containerRows = Array.isArray(snapshot.containers) ? snapshot.containers : [];
	const containerById = new Map(
		containerRows.map((row) => [String(row.ID || row.Id || ""), row] as const).filter(([id]) => id),
	);
	const containerByName = new Map(
		containerRows
			.map((row) => [pickContainerName(row), row] as const)
			.filter(([name]) => name && name !== "unknown"),
	);

	return statsRows.map((statsRow) => {
		const containerId = String(statsRow.ID || "");
		const matchedContainer =
			containerById.get(containerId) || containerByName.get(pickContainerName({}, statsRow)) || {};
		const memory = parseMemoryUsage(statsRow.MemUsage);
		const netIo = parseNetIo(statsRow.NetIO);
		const memoryPercent =
			parsePercent(statsRow.MemPerc) ??
			(memory.usageBytes && memory.limitBytes
				? (memory.usageBytes / Math.max(memory.limitBytes, 1)) * 100
				: null);

		return {
			id: randomUUID(),
			environmentId: "",
			containerId,
			containerName: pickContainerName(matchedContainer, statsRow),
			image: String(matchedContainer.Image || ""),
			state: String(matchedContainer.State || ""),
			cpuPercentTenths: toTenths(parsePercent(statsRow.CPUPerc)),
			memoryUsageBytes: memory.usageBytes,
			memoryLimitBytes: memory.limitBytes,
			memoryPercentTenths: toTenths(memoryPercent),
			rxBytesTotal: netIo.rxBytesTotal,
			txBytesTotal: netIo.txBytesTotal,
			sampledAt,
			createdAt: sampledAt,
		};
	});
}

export async function persistRuntimeSnapshotMetrics(input: {
	environmentId: string;
	snapshot: RuntimeSnapshotPayload;
	source?: string;
}) {
	const sampledAt = new Date();
	const hostTotalBytes = Number(input.snapshot.host?.totalMemoryGb || 0) * 1024 * 1024 * 1024;
	const hostFreeBytes = Number(input.snapshot.host?.freeMemoryGb || 0) * 1024 * 1024 * 1024;
	const memoryUsedBytes =
		hostTotalBytes > 0 ? Math.max(0, Math.round(hostTotalBytes - hostFreeBytes)) : null;

	await db.insert(environmentMetricSamples).values({
		id: randomUUID(),
		environmentId: input.environmentId,
		source: input.source || "native",
		hostname: input.snapshot.host?.hostname || null,
		cpuPercentTenths: toTenths(input.snapshot.usage?.cpuPercent ?? null),
		memoryPercentTenths: toTenths(input.snapshot.usage?.memoryPercent ?? null),
		memoryUsedBytes,
		memoryTotalBytes: hostTotalBytes > 0 ? Math.round(hostTotalBytes) : null,
		containerCount: Number(input.snapshot.counts?.containers || 0),
		runningContainerCount: Number(input.snapshot.counts?.runningContainers || 0),
		imageCount: Number(input.snapshot.counts?.images || 0),
		volumeCount: Number(input.snapshot.counts?.volumes || 0),
		networkCount: Number(input.snapshot.counts?.networks || 0),
		sampledAt,
		createdAt: sampledAt,
	});

	const containerRows = buildContainerMetricsRows(input.snapshot, sampledAt)
		.filter((row) => row.containerId)
		.map((row) => ({
			...row,
			environmentId: input.environmentId,
		}));

	if (containerRows.length > 0) {
		await db.insert(containerMetricSamples).values(containerRows);
	}

	const cutoff = addMinutes(sampledAt, -24 * 60);
	await Promise.all([
		db
			.delete(environmentMetricSamples)
			.where(
				and(
					eq(environmentMetricSamples.environmentId, input.environmentId),
					lt(environmentMetricSamples.sampledAt, cutoff),
				),
			),
		db
			.delete(containerMetricSamples)
			.where(
				and(
					eq(containerMetricSamples.environmentId, input.environmentId),
					lt(containerMetricSamples.sampledAt, cutoff),
				),
			),
	]).catch(() => {
		// Retention cleanup is best-effort and should not block sampling.
	});
}

function buildSeries<T extends { sampledAt: Date }>(
	rows: T[],
	getValue: (row: T, index: number, source: T[]) => number | null,
) {
	return rows
		.map((row, index, source) => ({
			time: formatTimelineTime(row.sampledAt),
			value: getValue(row, index, source),
		}))
		.filter((point) => point.value !== null) as Array<{ time: string; value: number }>;
}

type MetricsSeriesResult = {
	available: boolean;
	cpuPercent: number | null;
	memoryPercent: number | null;
	runningContainers: number | null;
	containerCount: number | null;
	imageCount: number | null;
	memoryUsedBytes: number | null;
	memoryTotalBytes: number | null;
	cpuSeries: Array<{ time: string; value: number }>;
	memorySeries: Array<{ time: string; value: number }>;
};

const metricsSeriesCache = new Map<string, { data: MetricsSeriesResult; expiresAt: number }>();
const METRICS_CACHE_TTL_MS = 10_000; // 10s — matches the broadcast cadence

export async function getEnvironmentMetricsSeries(
	environmentId: string,
): Promise<MetricsSeriesResult> {
	const now = Date.now();
	const cached = metricsSeriesCache.get(environmentId);
	if (cached && now < cached.expiresAt) {
		return cached.data;
	}

	const rows = await db.query.environmentMetricSamples.findMany({
		where: and(
			eq(environmentMetricSamples.environmentId, environmentId),
			gte(environmentMetricSamples.sampledAt, addMinutes(new Date(), -30)),
		),
		orderBy: [asc(environmentMetricSamples.sampledAt)],
	});

	const latest = rows.at(-1) || null;

	const result: MetricsSeriesResult = {
		available: rows.length > 0,
		cpuPercent: fromTenths(latest?.cpuPercentTenths ?? null),
		memoryPercent: fromTenths(latest?.memoryPercentTenths ?? null),
		runningContainers: latest?.runningContainerCount ?? null,
		containerCount: latest?.containerCount ?? null,
		imageCount: latest?.imageCount ?? null,
		memoryUsedBytes: latest?.memoryUsedBytes ?? null,
		memoryTotalBytes: latest?.memoryTotalBytes ?? null,
		cpuSeries: buildSeries(rows, (row) => fromTenths(row.cpuPercentTenths)),
		memorySeries: buildSeries(rows, (row) => fromTenths(row.memoryPercentTenths)),
	};

	metricsSeriesCache.set(environmentId, {
		data: result,
		expiresAt: now + METRICS_CACHE_TTL_MS,
	});

	return result;
}

export async function getRuntimeCollectorHealth(
	environment: {
		id: string;
		kind: "local" | "agent";
		name: string;
	},
	options?: { runtimeAvailable?: boolean },
) {
	const latest = await db.query.environmentMetricSamples.findFirst({
		where: eq(environmentMetricSamples.environmentId, environment.id),
		orderBy: [desc(environmentMetricSamples.sampledAt)],
	});

	if (!latest) {
		if (options?.runtimeAvailable) {
			return [
				{
					name:
						environment.kind === "local" ? "Dockroot local collector" : "Dockroot agent collector",
					status: "healthy",
					lastError: "",
				},
			];
		}

		return [
			{
				name:
					environment.kind === "local" ? "Dockroot local collector" : "Dockroot agent collector",
				status: "offline",
				lastError: "No native runtime samples have been collected yet.",
			},
		];
	}

	const ageMs = Date.now() - latest.sampledAt.getTime();
	const healthy = ageMs <= 60_000;
	return [
		{
			name: environment.kind === "local" ? "Dockroot local collector" : "Dockroot agent collector",
			status: healthy ? "healthy" : "degraded",
			lastError: healthy
				? ""
				: `Last runtime sample was collected ${Math.round(ageMs / 1000)} seconds ago.`,
		},
	];
}

export async function getContainerRuntimeMetrics(input: {
	environmentId: string;
	containerId: string;
	containerName?: string | null;
}) {
	const normalizedName = String(input.containerName || "").replace(/^\//, "");
	const matchConditions = [
		eq(containerMetricSamples.containerId, input.containerId),
		...(normalizedName ? [eq(containerMetricSamples.containerName, normalizedName)] : []),
	];
	const rows = await db.query.containerMetricSamples.findMany({
		where: and(
			eq(containerMetricSamples.environmentId, input.environmentId),
			gte(containerMetricSamples.sampledAt, addMinutes(new Date(), -30)),
			or(...matchConditions),
		),
		orderBy: [asc(containerMetricSamples.sampledAt)],
	});

	if (rows.length === 0) {
		return {
			available: false,
			cpuPercent: null,
			memoryBytes: null,
			memoryLimitBytes: null,
			rxBytes: null,
			txBytes: null,
			cpuSeries: [],
			memorySeries: [],
			rxSeries: [],
			txSeries: [],
		};
	}

	const latest = rows.at(-1) || null;
	const buildThroughputSeries = (
		key: "rxBytesTotal" | "txBytesTotal",
	): Array<{ time: string; value: number }> => {
		const points: Array<{ time: string; value: number }> = [];
		for (let index = 1; index < rows.length; index += 1) {
			const previous = rows[index - 1];
			const current = rows[index];
			const previousValue = Number(previous[key] ?? 0);
			const currentValue = Number(current[key] ?? 0);
			const elapsedSeconds = Math.max(
				(current.sampledAt.getTime() - previous.sampledAt.getTime()) / 1000,
				1,
			);
			const delta = Math.max(0, currentValue - previousValue);
			points.push({
				time: formatTimelineTime(current.sampledAt),
				value: delta / elapsedSeconds,
			});
		}
		return points;
	};

	const rxSeries = buildThroughputSeries("rxBytesTotal");
	const txSeries = buildThroughputSeries("txBytesTotal");

	return {
		available: true,
		cpuPercent: fromTenths(latest?.cpuPercentTenths ?? null),
		memoryBytes: latest?.memoryUsageBytes ?? null,
		memoryLimitBytes: latest?.memoryLimitBytes ?? null,
		rxBytes: rxSeries.at(-1)?.value ?? null,
		txBytes: txSeries.at(-1)?.value ?? null,
		cpuSeries: buildSeries(rows, (row) => fromTenths(row.cpuPercentTenths)),
		memorySeries: buildSeries(rows, (row) => Number(row.memoryUsageBytes ?? 0)),
		rxSeries,
		txSeries,
	};
}
