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
				<h3 className="text-sm font-semibold">Scrape targets</h3>
				<span className="text-xs text-muted">{targets.length} targets</span>
			</div>
			<div className="mt-3 grid gap-2 md:grid-cols-2">
				{targets.map((target) => (
					<div
						key={target.scrapeUrl}
						className="flex items-center justify-between rounded-lg border border-default/8 px-3 py-2"
					>
						<div className="min-w-0">
							<p className="text-sm font-medium">{target.job}</p>
							<p className="truncate text-xs text-muted">{target.scrapeUrl}</p>
							{target.lastError ? (
								<p className="mt-0.5 text-xs text-danger">{target.lastError}</p>
							) : null}
						</div>
						<StatusBadge status={target.health === "up" ? "healthy" : target.health} />
					</div>
				))}
			</div>
		</Panel>
	);
}
