import { LiveInfrastructureMetrics } from "@/components/live-infrastructure-metrics";
import { Panel, PanelContent, PanelHeader } from "@/components/ui/panel";
import { UtilizationBar } from "@/components/ui/utilization-bar";

export function DashboardInfrastructurePanel({
	includeRuntime,
	dashboardMetrics,
	runtime,
	hostTotalMemoryGb,
	memoryUsedPercent,
	memoryUsed,
	dataDir,
	environmentId,
	environmentKind,
}: {
	includeRuntime: boolean;
	dashboardMetrics: {
		cpuPercent: number | null;
		memoryPercent: number | null;
		runningContainers: number | null;
	} | null;
	runtime: {
		snapshot: {
			host: {
				hostname: string;
				platform: string;
				architecture: string;
				cpus: number;
			};
		};
	} | null;
	hostTotalMemoryGb: number | null;
	memoryUsedPercent: number | null;
	memoryUsed: number | null;
	dataDir?: string | null;
	environmentId?: string;
	environmentKind?: "local" | "agent";
}) {
	if (!(includeRuntime && dashboardMetrics)) {
		return (
			<Panel padding="md" className="min-w-0">
				<p className="text-xs font-medium text-muted">Infrastructure</p>
				<p className="mt-1 text-sm font-semibold">Telemetry unavailable</p>
				<p className="mt-2 text-xs text-muted">
					Host-level telemetry appears only for privileged users on local runtime environments.
				</p>
			</Panel>
		);
	}

	return (
		<Panel className="min-w-0">
			<PanelHeader>
				<div className="min-w-0">
					<p className="text-xs font-medium text-muted">Infrastructure</p>
					<div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
						<span className="text-xs text-muted">
							Containers{" "}
							<span className="font-mono text-sm font-semibold text-foreground">
								{dashboardMetrics.runningContainers ?? 0}
							</span>
						</span>
					</div>
				</div>
				{runtime ? (
					<div className="hidden shrink-0 text-right sm:block">
						<p className="text-[11px] text-muted">{runtime.snapshot.host.hostname}</p>
						<p className="text-[10px] text-muted/70">
							{runtime.snapshot.host.platform} · {runtime.snapshot.host.architecture} ·{" "}
							{runtime.snapshot.host.cpus} CPU
						</p>
					</div>
				) : null}
			</PanelHeader>
			<PanelContent>
				<LiveInfrastructureMetrics
					environmentId={environmentId}
					environmentKind={environmentKind}
					initialCpu={dashboardMetrics.cpuPercent}
					initialMemory={dashboardMetrics.memoryPercent}
				/>

				{runtime && hostTotalMemoryGb !== null ? (
					<div className="mt-4 flex flex-col gap-3 border-t border-default/8 pt-4 sm:flex-row sm:items-end sm:justify-between">
						<div className="min-w-0 flex-1 sm:max-w-xs">
							<UtilizationBar
								label="Host memory"
								percent={memoryUsedPercent ?? 0}
								valueLabel={`${memoryUsed ?? "—"} / ${hostTotalMemoryGb} GB`}
							/>
						</div>
						<p className="truncate text-[10px] text-muted/60">{dataDir}</p>
					</div>
				) : null}
			</PanelContent>
		</Panel>
	);
}
