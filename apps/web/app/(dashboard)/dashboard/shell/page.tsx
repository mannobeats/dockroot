import { PageHeader } from "@/components/page-header";
import { ShellSessionControls } from "@/components/shell-session-controls";
import { TerminalPanel } from "@/components/terminal-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";

export default async function ShellPage({
	searchParams,
}: {
	searchParams: Promise<{ target?: string; containerId?: string; environment?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(userId, params.environment);
	const containers = await listAccessibleContainersForUser(userId, role, environment.id);
	const allowHostShell = isPrivilegedRole(role);
	const requestedTarget = !allowHostShell
		? "container"
		: params.target === "container"
			? "container"
			: params.target === "host"
				? "host"
				: null;
	const selectedTarget = requestedTarget || (allowHostShell ? "host" : "container");
	const selectedContainer =
		requestedTarget === "container" && params.containerId
			? containers.find((container: Record<string, string>) => container.ID === params.containerId) || null
			: null;
	const shouldRenderTerminal = requestedTarget === "host" || Boolean(selectedContainer);

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Shell"
				description={
					allowHostShell
						? "Open a host shell or attach to a running container."
						: "Attach to a container in your workspace."
				}
			/>

			<ShellSessionControls
				environmentId={environment.id}
				allowHostShell={allowHostShell}
				containers={containers.map((container: Record<string, string>) => ({
					id: container.ID,
					name: container.Names,
					state: container.State,
				}))}
				initialTarget={selectedTarget}
				initialContainerId={selectedContainer?.ID}
			/>

			{selectedTarget === "container" && containers.length === 0 ? (
				<EmptyState
					title="No accessible containers available"
					description="Start a container or deploy a stack before opening a container shell."
					className="p-8"
				/>
			) : !requestedTarget ? (
				<EmptyState
					title="Choose a shell target"
					description="Pick host or container access above, then open the shell when you are ready."
					className="p-8"
				/>
			) : !shouldRenderTerminal ? (
				<EmptyState
					title="Select a container to continue"
					description="The shell opens only after you explicitly choose which running container to attach to."
					className="p-8"
				/>
			) : (
				<TerminalPanel
					target={selectedTarget}
					containerId={selectedContainer?.ID}
					transport="remote"
					environmentId={environment.id}
					label={selectedTarget === "container" ? selectedContainer?.Names || "Container" : "Host"}
				/>
			)}
		</div>
	);
}
