import { Activity, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";

function summarizeCollectorHealth(
	collectors: Array<{
		name: string;
		status: string;
		lastError: string;
	}>,
) {
	const healthy = collectors.filter((collector) => collector.status === "healthy").length;
	const degraded = collectors.length - healthy;

	return {
		healthy,
		degraded,
	};
}

export function MonitoringHealthPanel({
	collectors,
}: {
	collectors: Array<{
		name: string;
		status: string;
		lastError: string;
	}>;
}) {
	const summary = summarizeCollectorHealth(collectors);
	const headline =
		summary.degraded > 0
			? `${summary.degraded} collector${summary.degraded === 1 ? "" : "s"} need attention`
			: "All monitoring collectors are healthy";

	return (
		<Panel padding="md" className="min-w-0">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-xs font-medium text-muted">Monitoring Health</p>
					<p className="mt-1 text-sm font-semibold">{headline}</p>
					<p className="mt-1 text-xs text-muted">
						Dockroot is tracking telemetry ingestion and collector availability for this runtime.
					</p>
				</div>
				<div className="shrink-0">
					<Badge variant={summary.degraded > 0 ? "warning" : "success"}>
						{collectors.length} collector{collectors.length === 1 ? "" : "s"}
					</Badge>
				</div>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-3">
				<div className="rounded-xl border border-default/10 bg-surface-raised p-3">
					<div className="flex items-center gap-2">
						<ShieldCheck className="h-4 w-4 text-success" />
						<p className="text-xs font-medium text-muted">Healthy</p>
					</div>
					<p className="mt-2 text-2xl font-semibold tabular-nums">{summary.healthy}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface-raised p-3">
					<div className="flex items-center gap-2">
						<AlertTriangle className="h-4 w-4 text-warning" />
						<p className="text-xs font-medium text-muted">Needs Attention</p>
					</div>
					<p className="mt-2 text-2xl font-semibold tabular-nums">{summary.degraded}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface-raised p-3">
					<div className="flex items-center gap-2">
						<Activity className="h-4 w-4 text-accent" />
						<p className="text-xs font-medium text-muted">Telemetry</p>
					</div>
					<p className="mt-2 text-sm font-semibold">
						{summary.degraded > 0 ? "Partial coverage" : "Fully collecting"}
					</p>
				</div>
			</div>

			<div className="mt-4 space-y-2">
				{collectors.map((collector) => (
					<div
						key={collector.name}
						className="flex items-start justify-between gap-3 rounded-xl border border-default/10 bg-surface px-3 py-3"
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<CheckCircle2
									className={`h-3.5 w-3.5 ${collector.status === "healthy" ? "text-success" : "text-warning"}`}
								/>
								<p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
									{collector.name}
								</p>
							</div>
							{collector.lastError ? (
								<p className="mt-1 break-words text-[11px] text-warning [overflow-wrap:anywhere]">
									{collector.lastError}
								</p>
							) : (
								<p className="mt-1 text-[11px] text-muted">
									Telemetry is being collected successfully.
								</p>
							)}
						</div>
						<div className="shrink-0 pt-0.5">
							<StatusBadge status={collector.status} />
						</div>
					</div>
				))}
			</div>
		</Panel>
	);
}
