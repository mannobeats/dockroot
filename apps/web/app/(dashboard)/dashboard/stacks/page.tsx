import Link from "next/link";
import {
	adoptComposeProjectAction,
	controlComposeProjectAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { listStacks } from "@/lib/platform";

export default async function StacksPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const includeUntracked = isPrivilegedRole(role);

	const query = await searchParams;
	const search = (query.q || "").trim().toLowerCase();
	const stacks = await listStacks(userId, { includeUntracked });
	const filtered = search
		? stacks.filter((stack) =>
				[stack.name, stack.slug, stack.projectName || "", stack.environmentName || ""]
					.join(" ")
					.toLowerCase()
					.includes(search),
			)
		: stacks;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Operations"
				title="Stacks"
				description={`${filtered.length} compose stacks across all environments`}
			/>

			{/* Search */}
			<div className="rounded-xl border border-default/10 bg-surface p-4">
				<form className="flex flex-col gap-3 sm:flex-row">
					<input
						type="search"
						name="q"
						defaultValue={query.q || ""}
						placeholder="Search stacks, projects, environments..."
						className="h-9 flex-1 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
					/>
					<button
						type="submit"
						className="inline-flex h-9 items-center justify-center rounded-lg border border-default/10 bg-background px-4 text-sm font-medium transition-colors hover:border-default/20"
					>
						Filter
					</button>
				</form>
			</div>

			{/* Table */}
			<div className="rounded-xl border border-default/10 bg-surface">
				<div className="table-scroll">
					<table className="min-w-full text-left text-sm">
						<thead>
							<tr className="border-b border-default/10 text-xs text-muted">
								<th className="px-4 py-3 font-medium">Name</th>
								<th className="px-4 py-3 font-medium">Source</th>
								<th className="px-4 py-3 font-medium">Project</th>
								<th className="px-4 py-3 font-medium">Environment</th>
								<th className="px-4 py-3 font-medium">Containers</th>
								<th className="px-4 py-3 font-medium">Status</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/5">
							{filtered.length ? (
								filtered.map((stack) => (
									<tr
										key={`${stack.type}-${stack.slug}`}
										className="group transition-colors hover:bg-foreground/[0.02]"
									>
										<td className="px-4 py-3">
											<div className="space-y-0.5">
												<div className="flex items-center gap-2">
													<p className="font-medium">{stack.name}</p>
													<StatusBadge
														status={
															stack.type === "tracked" ? stack.status : stack.status.split("(")[0]
														}
													/>
												</div>
												<p className="text-xs text-muted">{stack.slug}</p>
											</div>
										</td>
										<td className="px-4 py-3 text-xs text-muted">
											{stack.type === "tracked" ? "Internal" : "Untracked"}
										</td>
										<td className="px-4 py-3 text-xs text-muted">{stack.projectName || "—"}</td>
										<td className="px-4 py-3 text-xs text-muted">{stack.environmentName || "—"}</td>
										<td className="px-4 py-3">
											<div className="space-y-0.5">
												<p className="text-sm font-medium">
													{stack.runningCount}/{stack.containerCount}
												</p>
												<p className="text-xs text-muted">
													{stack.containers
														.slice(0, 2)
														.map((c) => c.Names)
														.join(", ") || "—"}
												</p>
											</div>
										</td>
										<td className="px-4 py-3 text-xs text-muted">
											{stack.lastDeployment?.status || stack.status}
										</td>
										<td className="px-4 py-3">
											<div className="flex flex-wrap gap-1.5">
												{stack.type === "tracked" ? (
													<>
														<form action={deployStackAction}>
															<input type="hidden" name="stackId" value={stack.stackId || ""} />
															<FormSubmitButton
																label="Deploy"
																pendingLabel="Deploying..."
																className="inline-flex h-7 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background"
															/>
														</form>
														<form action={destroyStackAction}>
															<input type="hidden" name="stackId" value={stack.stackId || ""} />
															<FormSubmitButton
																label="Destroy"
																pendingLabel="Destroying..."
																className="inline-flex h-7 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
															/>
														</form>
														<Link
															href={`/dashboard/projects/${stack.projectId}/stacks/${stack.stackId}`}
															className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
														>
															Open
														</Link>
													</>
												) : includeUntracked ? (
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
																className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
															/>
														</form>
													))
												) : null}
												{stack.type === "untracked" && includeUntracked ? (
													<form action={adoptComposeProjectAction}>
														<input type="hidden" name="projectName" value={stack.slug} />
														{stack.configFiles.map((configFile) => (
															<input
																key={`adopt-${configFile}`}
																type="hidden"
																name="configFiles"
																value={configFile}
															/>
														))}
														<FormSubmitButton
															label="Adopt"
															pendingLabel="Adopting..."
															className="inline-flex h-7 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background"
														/>
													</form>
												) : null}
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
										No stacks found.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
