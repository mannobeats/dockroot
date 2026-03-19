import "server-only";

import { containerMetricSamples, db, environmentMetricSamples } from "@dockroot/db";
import { and, asc, desc, eq, gte, or } from "drizzle-orm";
import {
	addMinutes,
	buildSeries,
	buildThroughputSeries,
	downsampleSeries,
	fromTenths,
} from "./helpers";
import type { MetricsSeriesResult } from "./types";

const metricsSeriesCache = new Map<string, { data: MetricsSeriesResult; expiresAt: number }>();
const METRICS_CACHE_TTL_MS = 10_000; // 10s — matches the broadcast cadence

export async function getEnvironmentMetricsSeries(
	environmentId: string,
): Promise<MetricsSeriesResult> {
	const nowAt = Date.now();
	const cached = metricsSeriesCache.get(environmentId);
	if (cached && nowAt < cached.expiresAt) {
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

	const MAX_CHART_POINTS = 90;

	const result: MetricsSeriesResult = {
		available: rows.length > 0,
		cpuPercent: fromTenths(latest?.cpuPercentTenths ?? null),
		memoryPercent: fromTenths(latest?.memoryPercentTenths ?? null),
		runningContainers: latest?.runningContainerCount ?? null,
		containerCount: latest?.containerCount ?? null,
		imageCount: latest?.imageCount ?? null,
		memoryUsedBytes: latest?.memoryUsedBytes ?? null,
		memoryTotalBytes: latest?.memoryTotalBytes ?? null,
		cpuSeries: downsampleSeries(
			buildSeries(rows, (row) => fromTenths(row.cpuPercentTenths)),
			MAX_CHART_POINTS,
		),
		memorySeries: downsampleSeries(
			buildSeries(rows, (row) => fromTenths(row.memoryPercentTenths)),
			MAX_CHART_POINTS,
		),
	};

	metricsSeriesCache.set(environmentId, {
		data: result,
		expiresAt: nowAt + METRICS_CACHE_TTL_MS,
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

	const MAX_CHART_POINTS = 90;
	const latest = rows.at(-1) || null;
	const rxSeries = downsampleSeries(buildThroughputSeries(rows, "rxBytesTotal"), MAX_CHART_POINTS);
	const txSeries = downsampleSeries(buildThroughputSeries(rows, "txBytesTotal"), MAX_CHART_POINTS);

	return {
		available: true,
		cpuPercent: fromTenths(latest?.cpuPercentTenths ?? null),
		memoryBytes: latest?.memoryUsageBytes ?? null,
		memoryLimitBytes: latest?.memoryLimitBytes ?? null,
		rxBytes: rxSeries.at(-1)?.value ?? null,
		txBytes: txSeries.at(-1)?.value ?? null,
		cpuSeries: downsampleSeries(
			buildSeries(rows, (row) => fromTenths(row.cpuPercentTenths)),
			MAX_CHART_POINTS,
		),
		memorySeries: downsampleSeries(
			buildSeries(rows, (row) => Number(row.memoryUsageBytes ?? 0)),
			MAX_CHART_POINTS,
		),
		rxSeries,
		txSeries,
	};
}
