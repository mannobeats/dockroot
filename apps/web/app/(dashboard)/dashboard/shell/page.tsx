import { PageHeader } from "@/components/page-header";
import { ShellWorkspace } from "@/components/shell-workspace";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUserSession } from "@/lib/authorization";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";

function resolveShell(value: string | undefined): "sh" | "bash" | "ash" | "zsh" | "custom" {
	return value === "bash" || value === "ash" || value === "zsh" || value === "custom"
		? value
		: "sh";
}

export default async function ShellPage({
	searchParams,
}: {
	searchParams: Promise<{
		containerId?: string;
		environment?: string;
		shell?: "sh" | "bash" | "ash" | "zsh" | "custom";
		customShell?: string;
	}>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const shell = resolveShell(params.shell);
	const customShell = typeof params.customShell === "string" ? params.customShell : undefined;
	const environment = await resolveRuntimeEnvironment(userId, params.environment);
	const containers = (await listAccessibleContainersForUser(userId, role, environment.id)).filter(
		(container: Record<string, string>) => container.State === "running",
	);
	const selectedContainer = params.containerId
		? containers.find((container: Record<string, string>) => container.ID === params.containerId) ||
			null
		: null;
	const transport = environment.kind === "local" ? "local" : "remote";

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Shell"
				description="Attach to a running container in your environment."
			/>

			{containers.length === 0 ? (
				<EmptyState
					title="No accessible containers available"
					description="Start a running container or deploy a stack before opening a shell."
					className="p-8"
				/>
			) : (
				<ShellWorkspace
					environmentId={environment.id}
					containers={containers.map((container: Record<string, string>) => ({
						id: container.ID,
						name: container.Names,
						state: container.State,
						status: container.Status,
						image: container.Image,
					}))}
					initialContainerId={selectedContainer?.ID}
					initialShell={shell}
					initialCustomShell={customShell}
					transport={transport}
				/>
			)}
		</div>
	);
}
