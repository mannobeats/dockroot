import { StatusBadge } from "@/components/status-badge";
import { Panel } from "@/components/ui/panel";

export function MonitoringHealthGrid({
	targets,
}: {
	targets: Array<{
		job: string;
		health: string;
		lastError: string;
		scrapeUrl: string;
	}>;
}) {
	return (
		<Panel padding="md" className="min-w-0">
			<div className="flex items-center justify-between gap-3">
				<p className="text-xs font-medium text-muted">Scrape targets</p>
				<span className="text-xs tabular-nums text-muted">{targets.length}</span>
			</div>
			<div className="mt-2 space-y-1">
				{targets.map((target) => (
					<div
						key={target.scrapeUrl}
						className="flex items-start justify-between gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-foreground/[0.02]"
					>
						<div className="min-w-0 flex-1">
							<p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
								{target.job}
							</p>
							<p className="mt-0.5 break-all text-[11px] text-muted">{target.scrapeUrl}</p>
							{target.lastError ? (
								<p className="mt-1 break-words text-[11px] text-danger [overflow-wrap:anywhere]">
									{target.lastError}
								</p>
							) : null}
						</div>
						<div className="shrink-0 pt-0.5">
							<StatusBadge status={target.health === "up" ? "healthy" : target.health} />
						</div>
					</div>
				))}
			</div>
		</Panel>
	);
}
