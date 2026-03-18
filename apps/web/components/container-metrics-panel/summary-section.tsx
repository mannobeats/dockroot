import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { UtilizationBar } from "@/components/ui/utilization-bar";
import type { ContainerMetrics } from "./types";
import { formatBytes, getMemoryUtilizationPercent, safePercent } from "./utils";

export function ContainerMetricsSummarySection({ metrics }: { metrics: ContainerMetrics }) {
	const { hasReliableLimit, memoryUtilizationPercent } = getMemoryUtilizationPercent(metrics);

	return (
		<>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard label="CPU" value={`${metrics.cpuPercent?.toFixed(1) ?? "—"}%`} />
				<MetricCard label="Working set memory" value={formatBytes(metrics.memoryBytes)} />
				<MetricCard label="RX / sec" value={formatBytes(metrics.rxBytes)} />
				<MetricCard label="TX / sec" value={formatBytes(metrics.txBytes)} />
			</div>
			<Panel padding="md" className="space-y-4">
				<p className="text-sm font-semibold">Current utilization</p>
				<UtilizationBar
					label="CPU usage"
					valueLabel={`${metrics.cpuPercent?.toFixed(1) ?? "0.0"}%`}
					percent={safePercent(metrics.cpuPercent)}
					helper="Current usage against available CPU time"
				/>
				<UtilizationBar
					label="Memory usage"
					valueLabel={formatBytes(metrics.memoryBytes)}
					percent={safePercent(memoryUtilizationPercent)}
					helper={
						hasReliableLimit
							? `Usage against memory limit (${formatBytes(metrics.memoryLimitBytes)})`
							: "Relative to recent peak working set memory"
					}
				/>
			</Panel>
		</>
	);
}
