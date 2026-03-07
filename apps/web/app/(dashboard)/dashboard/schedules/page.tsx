import { PageHeader } from "@/components/page-header";

export default function SchedulesPage() {
	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Operations"
				title="Schedules"
				description="Reserved for recurring deployments, maintenance tasks, and future automation policies."
			/>
			<div className="rounded-[28px] border border-dashed border-default/20 bg-surface/80 p-8 text-sm text-muted">
				V1 ships manual deployment control first. This page is intentionally ready for recurring
				rollouts and maintenance windows in the next iteration.
			</div>
		</div>
	);
}
