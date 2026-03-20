import type { ContainerStats } from "@/components/containers-table-workspace/types";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { UtilizationBar } from "@/components/ui/utilization-bar";
import type { ContainerMetrics } from "./types";
import { formatBytes, getMemoryUtilizationPercent, safePercent } from "./utils";

export function ContainerMetricsSummarySection({
	metrics,
	liveStats,
}: {
	metrics: ContainerMetrics;
	liveStats?: ContainerStats | null;
}) {
	const cpuPercent = liveStats?.cpuPercent ?? metrics.cpuPercent;
	const memoryBytes = liveStats?.memoryUsageBytes ?? metrics.memoryBytes;
	const memoryLimitBytes = liveStats?.memoryLimitBytes ?? metrics.memoryLimitBytes;
	const rxBytes = liveStats?.networkRxBytes ?? metrics.rxBytes;
	const txBytes = liveStats?.networkTxBytes ?? metrics.txBytes;

	const hasReliableLimit =
		Number.isFinite(memoryLimitBytes) &&
		(memoryLimitBytes || 0) > 0 &&
		(memoryLimitBytes || 0) < 9_000_000_000_000_000;
	const memoryUtilizationPercent =
		liveStats?.memoryPercent ??
		(hasReliableLimit
			? ((memoryBytes || 0) / (memoryLimitBytes || 1)) * 100
			: getMemoryUtilizationPercent(metrics).memoryUtilizationPercent);

	return (
		<>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard label="CPU" value={`${cpuPercent?.toFixed(1) ?? "—"}%`} />
				<MetricCard label="Working set memory" value={formatBytes(memoryBytes)} />
				<MetricCard label="RX / sec" value={formatBytes(rxBytes)} />
				<MetricCard label="TX / sec" value={formatBytes(txBytes)} />
			</div>
			<Panel padding="md" className="space-y-4">
				<p className="text-sm font-semibold">Current utilization</p>
				<UtilizationBar
					label="CPU usage"
					valueLabel={`${cpuPercent?.toFixed(1) ?? "0.0"}%`}
					percent={safePercent(cpuPercent)}
					helper="Current usage against available CPU time"
				/>
				<UtilizationBar
					label="Memory usage"
					valueLabel={formatBytes(memoryBytes)}
					percent={safePercent(memoryUtilizationPercent)}
					helper={
						hasReliableLimit
							? `Usage against memory limit (${formatBytes(memoryLimitBytes)})`
							: "Relative to recent peak working set memory"
					}
				/>
			</Panel>
		</>
	);
}
