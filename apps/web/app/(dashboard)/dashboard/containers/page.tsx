import { Lock } from "lucide-react";
import Link from "next/link";
import { controlContainerAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveRuntimePanel } from "@/components/live-runtime-panel";
import { PageHeader } from "@/components/page-header";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { StatusBadge } from "@/components/status-badge";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";
import { getProtectedContainerLabel, isProtectedManagerContainer } from "@/lib/runtime-protection";

export default async function ContainersPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; status?: string; environment?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(userId, params.environment);
	const query = (params.q || "").toLowerCase();
	const status = (params.status || "all").toLowerCase();
	const containers = await listAccessibleContainersForUser(userId, role, environment.id);
	const includeRuntime = isPrivilegedRole(role) && environment.kind === "local";
	const filtered = containers.filter((container: Record<string, string>) => {
		const matchesQuery =
			!query ||
			container.Names?.toLowerCase().includes(query) ||
			container.Image?.toLowerCase().includes(query);
		const matchesStatus = status === "all" || (container.State || "").toLowerCase() === status;
		return matchesQuery && matchesStatus;
	});
	const runningCount = filtered.filter(
		(container: Record<string, string>) => container.State === "running",
	).length;
	const publishedCount = filtered.filter((container: Record<string, string>) =>
		container.Ports?.includes("->"),
	).length;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Containers"
				description={`${environment.name} — ${filtered.length} containers, ${runningCount} running`}
			/>

			{includeRuntime ? <LiveRuntimePanel /> : null}

			{/* Stats */}
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Total</p>
					<p className="mt-1 text-2xl font-semibold">{filtered.length}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Running</p>
					<p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
						{runningCount}
					</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Published ports</p>
					<p className="mt-1 text-2xl font-semibold">{publishedCount}</p>
				</div>
			</div>

			{/* Filter */}
			<div className="rounded-xl border border-default/10 bg-surface p-4">
				<form className="flex flex-col gap-3 sm:flex-row">
					<input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search containers..."
						className="h-9 flex-1 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
					/>
					<select
						name="status"
						defaultValue={status}
						className="h-9 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors focus:border-foreground/20"
					>
						<option value="all">All statuses</option>
						<option value="running">Running</option>
						<option value="exited">Exited</option>
						<option value="created">Created</option>
						<option value="paused">Paused</option>
					</select>
					<button
						type="submit"
						className="inline-flex h-9 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background"
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
								<th className="px-4 py-3 font-medium">Image</th>
								<th className="px-4 py-3 font-medium">State</th>
								<th className="px-4 py-3 font-medium">Status</th>
								<th className="px-4 py-3 font-medium">Ports</th>
								<th className="px-4 py-3 font-medium">Size</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/5">
							{filtered.length ? (
								filtered.map((container: Record<string, string>) => {
									const isProtected =
										environment.kind === "local" && isProtectedManagerContainer(container);
									const protectedLabel =
										environment.kind === "local" ? getProtectedContainerLabel(container) : "";

									return (
										<tr
											key={`${container.ID}-${container.Names}`}
											className="group transition-colors hover:bg-foreground/[0.02]"
										>
											<td className="px-4 py-3">
												<div className="space-y-0.5">
													<div className="flex items-center gap-2">
														<Link
															href={`/dashboard/containers/${container.ID}?environment=${environment.id}`}
															className="font-medium transition-colors hover:text-foreground/80"
														>
															{container.Names}
														</Link>
														{isProtected ? (
															<span
																title={protectedLabel || undefined}
																className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
															>
																<Lock className="h-2.5 w-2.5" />
																Locked
															</span>
														) : null}
													</div>
													{container.Labels?.includes("com.docker.compose.project=") ? (
														<p className="text-xs text-muted">
															{container.Labels.split(",")
																.find((label) => label.startsWith("com.docker.compose.project="))
																?.split("=")
																.slice(1)
																.join("=")}
														</p>
													) : null}
												</div>
											</td>
											<td className="px-4 py-3 text-xs text-muted">{container.Image}</td>
											<td className="px-4 py-3">
												<StatusBadge status={(container.State || "offline").toLowerCase()} />
											</td>
											<td className="px-4 py-3 text-xs text-muted">{container.Status || "—"}</td>
											<td className="px-4 py-3">
												<RuntimePortLinks ports={container.Ports} compact />
											</td>
											<td className="px-4 py-3 text-xs text-muted">{container.Size || "—"}</td>
											<td className="px-4 py-3">
												<div className="flex flex-wrap gap-1.5">
													<Link
														href={`/dashboard/containers/${container.ID}?environment=${environment.id}`}
														className="inline-flex h-7 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
													>
														Open
													</Link>
													{(["start", "stop", "restart", "remove"] as const).map((action) => (
														<form key={action} action={controlContainerAction}>
															<input type="hidden" name="containerId" value={container.ID} />
															<input type="hidden" name="action" value={action} />
															<input type="hidden" name="environmentId" value={environment.id} />
															<FormSubmitButton
																label={action}
																pendingLabel={`${action}ing...`}
																disabled={isProtected}
																title={isProtected ? "Protected container" : undefined}
																className="inline-flex h-7 items-center rounded-md border border-default/10 bg-background px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
															/>
														</form>
													))}
													<Link
														href={`/dashboard/shell?target=container&containerId=${container.ID}&environment=${environment.id}`}
														className="inline-flex h-7 items-center rounded-md border border-default/10 bg-background px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
													>
														Shell
													</Link>
													<Link
														href={`/dashboard/logs?mode=single&container=${container.ID}&environment=${environment.id}`}
														className="inline-flex h-7 items-center rounded-md border border-default/10 bg-background px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
													>
														Logs
													</Link>
												</div>
											</td>
										</tr>
									);
								})
							) : (
								<tr>
									<td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
										No containers matched the current filters.
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
