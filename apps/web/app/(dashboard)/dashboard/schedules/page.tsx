import { PageHeader } from "@/components/page-header";

export default function SchedulesPage() {
	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Schedules"
				description="Recurring deployments and automation policies"
			/>
			<div className="rounded-lg border border-dashed border-default/10 p-8 text-center text-sm text-muted">
				Scheduled deployments and maintenance windows are coming in the next release.
			</div>
		</div>
	);
}
