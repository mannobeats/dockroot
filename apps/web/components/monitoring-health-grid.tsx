import { StatusBadge } from "@/components/status-badge";

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
		<div className="rounded-2xl border border-default/15 bg-surface p-5">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
						Monitoring fabric
					</p>
					<h3 className="mt-2 text-lg font-semibold tracking-tight">Scrape targets</h3>
				</div>
				<p className="text-sm text-muted">{targets.length} configured targets</p>
			</div>
			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{targets.map((target) => (
					<div
						key={target.scrapeUrl}
						className="rounded-xl border border-default/15 bg-background/60 p-4"
					>
						<div className="flex items-center justify-between gap-3">
							<p className="text-sm font-semibold">{target.job}</p>
							<StatusBadge status={target.health === "up" ? "healthy" : target.health} />
						</div>
						<p className="mt-2 break-all text-xs text-muted">{target.scrapeUrl}</p>
						<p className="mt-2 text-xs text-muted">
							{target.lastError || "No scrape errors reported."}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}
