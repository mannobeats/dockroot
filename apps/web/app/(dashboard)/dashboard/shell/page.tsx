import { PageHeader } from "@/components/page-header";
import { TerminalPanel } from "@/components/terminal-panel";
import { listContainers } from "@/lib/platform/docker";

export default async function ShellPage({
	searchParams,
}: {
	searchParams: Promise<{ target?: string; containerId?: string }>;
}) {
	const params = await searchParams;
	const containers = await listContainers();
	const selectedContainer =
		params.target === "container" && params.containerId
			? containers.find((container) => container.ID === params.containerId)
			: null;
	const isContainerShell = Boolean(selectedContainer);

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Shell"
				description="Open an interactive host shell or attach directly to a running container."
			/>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<form className="grid gap-3 lg:grid-cols-[180px_1fr_auto]">
					<select
						name="target"
						defaultValue={isContainerShell ? "container" : "host"}
						className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					>
						<option value="host">Host shell</option>
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

			<TerminalPanel
				target={isContainerShell ? "container" : "host"}
				containerId={selectedContainer?.ID}
				label={isContainerShell ? selectedContainer?.Names || "Container" : "Manager host"}
			/>
		</div>
	);
}
