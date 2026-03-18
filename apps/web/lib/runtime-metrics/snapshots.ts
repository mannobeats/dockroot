import "server-only";

import { randomUUID } from "node:crypto";
import { containerMetricSamples, db, environmentMetricSamples } from "@dockroot/db";
import { and, eq, lt } from "drizzle-orm";
import {
	addMinutes,
	parseMemoryUsage,
	parseNetIo,
	parsePercent,
	pickContainerName,
	toTenths,
} from "./helpers";
import type { RuntimeSnapshotPayload } from "./types";

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
