import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/ui/panel";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import {
	getOrCreateContainerUpdateSchedule,
	listContainerUpdateRuns,
} from "@/lib/container-updates";
import { listEnvironments } from "@/lib/platform";
import { SchedulePageActions } from "./schedule-actions";
import { ScheduleConfigurationPanel } from "./schedule-configuration-panel";
import { ScheduleRunsPanel } from "./schedule-runs-panel";

export default async function SchedulesPage({
	searchParams,
}: {
	searchParams: Promise<{ environment?: string }>;
}) {
	const { userId } = await requirePrivilegedPageSession();
	const params = await searchParams;
	const environments = await listEnvironments(userId);
	const selectedEnvironmentId =
		params.environment && environments.some((environment) => environment.id === params.environment)
			? params.environment
			: environments[0]?.id;

	if (!selectedEnvironmentId) {
		return (
			<div className="animate-in space-y-5">
				<PageHeader title="Schedules" description="Recurring container update automation" />
				<Panel className="p-8 text-center text-sm text-muted">No environments are available.</Panel>
			</div>
		);
	}

	const selectedEnvironment = environments.find(
		(environment) => environment.id === selectedEnvironmentId,
	);
	const schedule = await getOrCreateContainerUpdateSchedule(userId, selectedEnvironmentId);
	const runs = await listContainerUpdateRuns({
		userId,
		environmentId: selectedEnvironmentId,
		limit: 20,
	});

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Schedules"
				description={`${selectedEnvironment?.name || "Environment"} · recurring update checks and deployments`}
				actions={<SchedulePageActions environmentId={selectedEnvironmentId} />}
			/>

			<ScheduleConfigurationPanel environmentId={selectedEnvironmentId} schedule={schedule} />
			<ScheduleRunsPanel runs={runs} />
		</div>
	);
}
