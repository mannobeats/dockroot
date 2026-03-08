import { LiveLogsWorkspace } from "@/components/live-logs-workspace";
import { PageHeader } from "@/components/page-header";
import { requireUserSession } from "@/lib/authorization";
import {
	getContainerLogsForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";

export default async function LogsPage({
	searchParams,
}: {
	searchParams: Promise<{
		mode?: string;
		container?: string;
		containers?: string;
		environment?: string;
	}>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(userId, params.environment);
	const containers = await listAccessibleContainersForUser(userId, role, environment.id);
	const initialMode = params.mode === "grouped" ? "grouped" : "single";
	const requestedIds =
		initialMode === "grouped"
			? (params.containers || "")
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean)
			: ([params.container].filter(Boolean) as string[]);
	const accessibleIds = new Set(
		containers.map((container: Record<string, string>) => container.ID),
	);
	const initialSelectedIds = (
		initialMode === "grouped"
			? requestedIds
			: requestedIds.length
				? requestedIds
				: [containers[0]?.ID].filter(Boolean)
	).filter((containerId) => accessibleIds.has(containerId));
	const selectedContainers = containers.filter((container: Record<string, string>) =>
		initialSelectedIds.includes(container.ID),
	);
	const initialLogs = Object.fromEntries(
		await Promise.all(
			selectedContainers.map(async (container: Record<string, string>) => [
				container.ID,
				(
					await getContainerLogsForEnvironment(userId, container.ID, environment.id, {
						tail: 150,
					})
				).logs,
			]),
		),
	);

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Logs"
				description={`Single-container and grouped logs for ${environment.name}.`}
			/>

			<LiveLogsWorkspace
				containers={containers.map((container: Record<string, string>) => ({
					id: container.ID,
					name: container.Names,
					image: container.Image,
					state: container.State,
				}))}
				initialLogs={initialLogs}
				initialMode={initialMode}
				initialSelectedIds={initialSelectedIds}
				transport={environment.kind === "local" ? "local" : "remote"}
				environmentId={environment.id}
			/>
		</div>
	);
}
