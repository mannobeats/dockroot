import { PageHeader } from "@/components/page-header";

export default function SchedulesPage() {
	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Operations"
				title="Schedules"
				description="Recurring deployments and automation policies"
			/>
			<div className="rounded-xl border border-dashed border-default/10 p-12 text-center text-sm text-muted">
				Scheduled deployments and maintenance windows are coming in the next release.
			</div>
		</div>
	);
}
