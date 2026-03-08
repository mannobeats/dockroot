import { PageHeader } from "@/components/page-header";
import { TerminalPanel } from "@/components/terminal-panel";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";

export default async function ShellPage({
	searchParams,
}: {
	searchParams: Promise<{ target?: string; containerId?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const containers = await listAccessibleContainersForUser(userId, role);
	const allowHostShell = isPrivilegedRole(role);
	const requestedContainer =
		params.target === "container" && params.containerId
			? containers.find((container) => container.ID === params.containerId)
			: null;
	const selectedContainer = requestedContainer || (!allowHostShell ? containers[0] : null);
	const isContainerShell = !allowHostShell || Boolean(selectedContainer);

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Shell"
				description={
					allowHostShell
						? "Open an interactive host shell or attach directly to a running container."
						: "Open an interactive shell inside a container that belongs to your workspace."
				}
			/>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<form className="grid gap-3 lg:grid-cols-[180px_1fr_auto]">
					<select
						name="target"
						defaultValue={isContainerShell ? "container" : "host"}
						className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					>
						{allowHostShell ? <option value="host">Host shell</option> : null}
						<option value="container">Container shell</option>
					</select>
					<select
						name="containerId"
						defaultValue={selectedContainer?.ID || ""}
						className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					>
						<option value="">Select container</option>
						{containers.map((container) => (
							<option key={container.ID} value={container.ID}>
								{container.Names} ({container.State})
							</option>
						))}
					</select>
					<button
						type="submit"
						className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white"
					>
						Open shell
					</button>
				</form>
			</section>

			{isContainerShell && !selectedContainer ? (
				<div className="rounded-2xl border border-default/15 bg-surface p-6 text-sm text-muted">
					No accessible containers are available for an interactive shell.
				</div>
			) : (
				<TerminalPanel
					target={isContainerShell ? "container" : "host"}
					containerId={selectedContainer?.ID}
					label={isContainerShell ? selectedContainer?.Names || "Container" : "Manager host"}
				/>
			)}
		</div>
	);
}
