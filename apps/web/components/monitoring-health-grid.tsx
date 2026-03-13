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
		<Panel padding="md">
			<div className="flex items-center justify-between">
				<p className="text-xs font-medium text-muted">Scrape targets</p>
				<span className="text-xs tabular-nums text-muted">{targets.length}</span>
			</div>
			<div className="mt-2 space-y-1">
				{targets.map((target) => (
					<div
						key={target.scrapeUrl}
						className="flex items-center justify-between rounded-md px-2.5 py-2 transition-colors hover:bg-foreground/[0.02]"
					>
						<div className="min-w-0">
							<p className="text-sm font-medium">{target.job}</p>
							<p className="truncate text-[11px] text-muted">{target.scrapeUrl}</p>
							{target.lastError ? (
								<p className="text-[11px] text-danger">{target.lastError}</p>
							) : null}
						</div>
						<StatusBadge status={target.health === "up" ? "healthy" : target.health} />
					</div>
				))}
			</div>
		</Panel>
	);
}
