import { PageHeader } from "@/components/page-header";
import { TerminalPanel } from "@/components/terminal-panel";
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
	const requestedContainer =
		params.target === "container" && params.containerId
			? containers.find((container: Record<string, string>) => container.ID === params.containerId)
			: null;
	const selectedContainer =
		requestedContainer || (params.target === "container" || !allowHostShell ? containers[0] : null);
	const isContainerShell = !allowHostShell || Boolean(selectedContainer);

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Shell"
				description={allowHostShell
					? "Open a host shell or attach to a running container."
					: "Attach to a container in your workspace."}
			/>

			<div className="rounded-xl border border-default/10 bg-surface p-4">
				<form className="flex flex-col gap-3 sm:flex-row">
					<input type="hidden" name="environment" value={environment.id} />
					<select
						name="target"
						defaultValue={isContainerShell ? "container" : "host"}
						className="h-9 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors focus:border-foreground/20"
					>
						{allowHostShell ? <option value="host">Host shell</option> : null}
						<option value="container">Container shell</option>
					</select>
					<select
						name="containerId"
						defaultValue={selectedContainer?.ID || ""}
						className="h-9 flex-1 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors focus:border-foreground/20"
					>
						<option value="">Select container</option>
						{containers.map((container: Record<string, string>) => (
							<option key={container.ID} value={container.ID}>
								{container.Names} ({container.State})
							</option>
						))}
					</select>
					<button
						type="submit"
						className="inline-flex h-9 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background"
					>
						Connect
					</button>
				</form>
			</div>

			{isContainerShell && !selectedContainer ? (
				<div className="rounded-xl border border-dashed border-default/10 p-8 text-center text-sm text-muted">
					No accessible containers available.
				</div>
			) : (
				<TerminalPanel
					target={isContainerShell ? "container" : "host"}
					containerId={selectedContainer?.ID}
					transport={environment.kind === "local" ? "local" : "remote"}
					environmentId={environment.id}
					label={isContainerShell ? selectedContainer?.Names || "Container" : "Host"}
				/>
			)}
		</div>
	);
}
