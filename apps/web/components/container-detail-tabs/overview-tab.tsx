import type { ContainerStats } from "@/components/containers-table-workspace/types";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { UtilizationBar } from "@/components/ui/utilization-bar";

interface OverviewTabProps {
	inspect: Record<string, unknown>;
	liveStats: ContainerStats | null;
	publishedPortSummary: string;
	managerUrl?: string | null;
	recentLogs: string;
	containerId: string;
	environmentId: string;
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let i = 0;
	let val = bytes;
	while (val >= 1024 && i < units.length - 1) {
		val /= 1024;
		i++;
	}
	return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function OverviewTab({
	inspect,
	liveStats,
	publishedPortSummary,
	managerUrl,
	recentLogs,
	containerId,
	environmentId,
}: OverviewTabProps) {
	const cpuPercent = liveStats?.cpuPercent ?? 0;
	const memoryPercent = liveStats?.memoryPercent ?? 0;
	const memoryUsage = liveStats ? formatBytes(liveStats.memoryUsageBytes) : "—";
	const memoryLimit = liveStats ? formatBytes(liveStats.memoryLimitBytes) : "—";
	const memCpuSummary = liveStats ? `${memoryUsage} · ${cpuPercent.toFixed(1)}%` : "—";

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
					value={memCpuSummary}
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
					valueLabel={memoryUsage}
					percent={memoryPercent}
					helper={`Usage against limit (${memoryLimit})`}
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
