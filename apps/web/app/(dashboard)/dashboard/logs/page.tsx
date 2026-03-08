import { LiveLogsWorkspace } from "@/components/live-logs-workspace";
import { PageHeader } from "@/components/page-header";
import { requireUserSession } from "@/lib/authorization";
import { getContainerLogs } from "@/lib/platform/docker";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";

export default async function LogsPage({
	searchParams,
}: {
	searchParams: Promise<{ mode?: string; container?: string; containers?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const containers = await listAccessibleContainersForUser(userId, role);
	const initialMode = params.mode === "grouped" ? "grouped" : "single";
	const requestedIds =
		initialMode === "grouped"
			? (params.containers || "")
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean)
			: ([params.container].filter(Boolean) as string[]);
	const accessibleIds = new Set(containers.map((container) => container.ID));
	const initialSelectedIds = (
		initialMode === "grouped"
			? requestedIds
			: requestedIds.length
				? requestedIds
				: [containers[0]?.ID].filter(Boolean)
	).filter((containerId) => accessibleIds.has(containerId));
	const selectedContainers = containers.filter((container) =>
		initialSelectedIds.includes(container.ID),
	);
	const initialLogs = Object.fromEntries(
		await Promise.all(
			selectedContainers.map(async (container) => [
				container.ID,
				await getContainerLogs(container.ID, { tail: 150 }),
			]),
		),
	);

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Logs"
				description="Single-container and grouped live logs with container-aware selection."
			/>

			<LiveLogsWorkspace
				containers={containers.map((container) => ({
					id: container.ID,
					name: container.Names,
					image: container.Image,
					state: container.State,
				}))}
				initialLogs={initialLogs}
				initialMode={initialMode}
				initialSelectedIds={initialSelectedIds}
			/>
		</div>
	);
}
