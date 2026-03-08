import Link from "next/link";
import {
	controlComposeProjectAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listStacks } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function StacksPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const query = await searchParams;
	const search = (query.q || "").trim().toLowerCase();
	const stacks = await listStacks(session.user.id);
	const filtered = search
		? stacks.filter((stack) =>
				[stack.name, stack.slug, stack.projectName || "", stack.environmentName || ""]
					.join(" ")
					.toLowerCase()
					.includes(search),
			)
		: stacks;

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Operations"
				title="Compose stacks"
				description="Operate tracked Dockroot stacks and external compose projects from one fleet view."
			/>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 className="text-lg font-semibold tracking-tight">Fleet</h2>
						<p className="mt-1 text-sm text-muted">
							Tracked stacks stay linked to projects. Untracked compose projects are still operable
							here.
						</p>
					</div>
					<form className="flex w-full gap-3 lg:w-auto">
						<input
							type="search"
							name="q"
							defaultValue={query.q || ""}
							placeholder="Search stacks, projects, environments"
							className="h-11 flex-1 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent lg:w-[340px]"
						/>
						<button
							type="submit"
							className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-background px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
						>
							Filter
						</button>
					</form>
				</div>

				<div className="mt-5 overflow-hidden rounded-2xl border border-default/10">
					<table className="min-w-full divide-y divide-default/10 text-sm">
						<thead className="bg-background/70">
							<tr className="text-left text-muted">
								<th className="px-4 py-3 font-medium">Name</th>
								<th className="px-4 py-3 font-medium">Source</th>
								<th className="px-4 py-3 font-medium">Project</th>
								<th className="px-4 py-3 font-medium">Environment</th>
								<th className="px-4 py-3 font-medium">Containers</th>
								<th className="px-4 py-3 font-medium">Latest status</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/10 bg-surface/70">
							{filtered.length ? (
								filtered.map((stack) => (
									<tr key={`${stack.type}-${stack.slug}`} className="align-top">
										<td className="px-4 py-4">
											<div className="space-y-1">
												<div className="flex items-center gap-2">
													<p className="font-semibold">{stack.name}</p>
													<StatusBadge
														status={
															stack.type === "tracked" ? stack.status : stack.status.split("(")[0]
														}
													/>
												</div>
												<p className="text-xs text-muted">{stack.slug}</p>
												<p className="text-xs text-muted">
													{stack.type === "tracked"
														? `${stack.composeFileName} • ${stack.sourceType === "github" ? "GitHub App" : "Manual"}`
														: stack.configFiles.join(", ") || "Compose files not reported"}
												</p>
											</div>
										</td>
										<td className="px-4 py-4 text-muted">
											{stack.type === "tracked" ? "Internal" : "Untracked"}
										</td>
										<td className="px-4 py-4 text-muted">{stack.projectName || "—"}</td>
										<td className="px-4 py-4 text-muted">{stack.environmentName || "—"}</td>
										<td className="px-4 py-4">
											<div className="space-y-1">
												<p className="font-medium">
													{stack.runningCount}/{stack.containerCount} running
												</p>
												<p className="text-xs text-muted">
													{stack.containers
														.slice(0, 3)
														.map((container) => container.Names)
														.join(", ") || "No containers reported"}
												</p>
											</div>
										</td>
										<td className="px-4 py-4 text-muted">
											{stack.lastDeployment?.status || stack.status}
										</td>
										<td className="px-4 py-4">
											<div className="flex flex-wrap gap-2">
												{stack.type === "tracked" ? (
													<>
														<form action={deployStackAction}>
															<input type="hidden" name="stackId" value={stack.stackId || ""} />
															<FormSubmitButton
																label="Deploy"
																pendingLabel="Deploying..."
																className="inline-flex h-9 items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-white"
															/>
														</form>
														<form action={destroyStackAction}>
															<input type="hidden" name="stackId" value={stack.stackId || ""} />
															<FormSubmitButton
																label="Destroy"
																pendingLabel="Destroying..."
																className="inline-flex h-9 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-sm font-medium text-danger"
															/>
														</form>
														<Link
															href={`/dashboard/projects/${stack.projectId}/stacks/${stack.stackId}`}
															className="inline-flex h-9 items-center justify-center rounded-lg border border-default/20 px-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
														>
															Open
														</Link>
													</>
												) : (
													(["start", "stop", "restart", "destroy"] as const).map((action) => (
														<form key={action} action={controlComposeProjectAction}>
															<input type="hidden" name="projectName" value={stack.slug} />
															<input type="hidden" name="action" value={action} />
															{stack.configFiles.map((configFile) => (
																<input
																	key={configFile}
																	type="hidden"
																	name="configFiles"
																	value={configFile}
																/>
															))}
															<FormSubmitButton
																label={action}
																pendingLabel={`${action}ing...`}
																className="inline-flex h-9 items-center justify-center rounded-lg border border-default/20 px-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
															/>
														</form>
													))
												)}
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
										No compose stacks matched this filter.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
