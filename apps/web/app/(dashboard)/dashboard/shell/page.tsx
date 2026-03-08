import { PageHeader } from "@/components/page-header";
import { TerminalPanel } from "@/components/terminal-panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
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
				description={
					allowHostShell
						? "Open a host shell or attach to a running container."
						: "Attach to a container in your workspace."
				}
			/>

			<Panel padding="sm">
				<form className="flex flex-col gap-3 sm:flex-row">
					<input type="hidden" name="environment" value={environment.id} />
					<Select
						name="target"
						defaultValue={isContainerShell ? "container" : "host"}
					>
						{allowHostShell ? <option value="host">Host shell</option> : null}
						<option value="container">Container shell</option>
					</Select>
					<Select
						name="containerId"
						defaultValue={selectedContainer?.ID || ""}
						className="flex-1"
					>
						<option value="">Select container</option>
						{containers.map((container: Record<string, string>) => (
							<option key={container.ID} value={container.ID}>
								{container.Names} ({container.State})
							</option>
						))}
					</Select>
					<Button type="submit">
						Connect
					</Button>
				</form>
			</Panel>

			{isContainerShell && !selectedContainer ? (
				<EmptyState title="No accessible containers available" className="p-8" />
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
