import { RuntimePortLinks } from "@/components/runtime-port-links";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { UtilizationBar } from "@/components/ui/utilization-bar";

interface OverviewTabProps {
	inspect: Record<string, unknown>;
	details: Record<string, unknown> | null;
	runtimeStats: Record<string, string>;
	cpuPercent: number;
	memoryPercent: number;
	publishedPortSummary: string;
	managerUrl?: string | null;
	recentLogs: string;
	containerId: string;
	environmentId: string;
}

export function OverviewTab({
	inspect,
	details,
	runtimeStats,
	cpuPercent,
	memoryPercent,
	publishedPortSummary,
	managerUrl,
	recentLogs,
	containerId,
	environmentId,
}: OverviewTabProps) {
	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					label="Image"
					value={String((inspect.Config as Record<string, unknown>)?.Image || "—")}
					className="h-full"
					valueClassName="break-all text-sm"
				/>
				<MetricCard
					label="Started"
					value={String((inspect.State as Record<string, unknown>)?.StartedAt || "—")}
					className="h-full"
					valueClassName="text-sm"
				/>
				<MetricCard
					label="Restart count"
					value={String((inspect as Record<string, unknown>).RestartCount || 0)}
					className="h-full"
					valueClassName="text-sm"
				/>
				<MetricCard
					label="Memory / CPU"
					value={details ? `${runtimeStats.MemUsage || "—"} · ${runtimeStats.CPUPerc || "—"}` : "—"}
					className="h-full"
					valueClassName="text-sm"
				/>
			</div>

			<Panel padding="md" className="space-y-4">
				<p className="text-sm font-semibold">Current resource utilization</p>
				<UtilizationBar
					label="CPU"
					valueLabel={`${cpuPercent.toFixed(1)}%`}
					percent={cpuPercent}
					helper="Live container CPU usage"
				/>
				<UtilizationBar
					label="Memory"
					valueLabel={runtimeStats.MemUsage || "—"}
					percent={memoryPercent}
					helper={`Usage against limit (${runtimeStats.MemLimit || "—"})`}
				/>
			</Panel>

			<Panel padding="sm">
				<p className="text-xs text-muted">Published ports</p>
				<div className="mt-3">
					<RuntimePortLinks ports={publishedPortSummary} managerUrl={managerUrl} />
				</div>
			</Panel>

			<Panel padding="sm">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold">Recent logs</p>
					<LinkButton
						href={`/dashboard/logs?mode=single&container=${containerId}&environment=${environmentId}`}
						variant="ghost"
						size="sm"
					>
						Open live logs →
					</LinkButton>
				</div>
				<LogBlock className="mt-3 max-h-[320px] p-4">{recentLogs}</LogBlock>
			</Panel>
		</div>
	);
}
