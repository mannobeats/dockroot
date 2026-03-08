import { LiveLogsWorkspace } from "@/components/live-logs-workspace";
import { PageHeader } from "@/components/page-header";
import { getContainerLogs, listContainers } from "@/lib/platform/docker";

export default async function LogsPage({
	searchParams,
}: {
	searchParams: Promise<{ mode?: string; container?: string; containers?: string }>;
}) {
	const params = await searchParams;
	const containers = await listContainers();
	const initialMode = params.mode === "grouped" ? "grouped" : "single";
	const initialSelectedIds =
		initialMode === "grouped"
			? (params.containers || "")
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean)
			: ([params.container || containers[0]?.ID].filter(Boolean) as string[]);
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
