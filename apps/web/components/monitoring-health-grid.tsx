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
				<p className="text-xs text-muted">{targets.length} targets</p>
			</div>
			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{targets.map((target) => (
					<div
						key={target.scrapeUrl}
						className="rounded-lg border border-default/10 bg-foreground/[0.02] p-4 transition-colors hover:border-default/20"
					>
						<div className="flex items-center justify-between gap-3">
							<p className="text-sm font-medium">{target.job}</p>
							<StatusBadge status={target.health === "up" ? "healthy" : target.health} />
						</div>
						<p className="mt-2 break-all text-xs text-muted">{target.scrapeUrl}</p>
						{target.lastError ? (
							<p className="mt-1 text-xs text-danger">{target.lastError}</p>
						) : null}
					</div>
				))}
			</div>
		</Panel>
	);
}
