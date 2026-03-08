import Link from "next/link";
import { controlContainerAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveRuntimePanel } from "@/components/live-runtime-panel";
import { PageHeader } from "@/components/page-header";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { StatusBadge } from "@/components/status-badge";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";

export default async function ContainersPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; status?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const query = (params.q || "").toLowerCase();
	const status = (params.status || "all").toLowerCase();
	const containers = await listAccessibleContainersForUser(userId, role);
	const includeRuntime = isPrivilegedRole(role);
	const filtered = containers.filter((container) => {
		const matchesQuery =
			!query ||
			container.Names?.toLowerCase().includes(query) ||
			container.Image?.toLowerCase().includes(query);
		const matchesStatus = status === "all" || (container.State || "").toLowerCase() === status;
		return matchesQuery && matchesStatus;
	});
	const runningCount = filtered.filter((container) => container.State === "running").length;
	const publishedCount = filtered.filter((container) => container.Ports?.includes("->")).length;

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Containers"
				description={
					includeRuntime
						? "Inspect, control, remove, and jump into logs for every runtime container on the manager host."
						: "Inspect and operate runtime containers that belong to your workspace."
				}
			/>

			{includeRuntime ? <LiveRuntimePanel /> : null}

			<section className="grid gap-4 lg:grid-cols-3">
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Visible containers</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{filtered.length}</p>
					<p className="mt-2 text-sm text-muted">Filtered runtime scope for this host.</p>
				</div>
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Running now</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{runningCount}</p>
					<p className="mt-2 text-sm text-muted">
						Live workloads that can be opened, tailed, or shelled.
					</p>
				</div>
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Published ports</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{publishedCount}</p>
					<p className="mt-2 text-sm text-muted">
						Containers exposing host ports with direct browser links.
					</p>
				</div>
			</section>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<form className="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
					<input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search containers, images, or names"
						className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					/>
					<select
						name="status"
						defaultValue={status}
						className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					>
						<option value="all">All statuses</option>
						<option value="running">Running</option>
						<option value="exited">Exited</option>
						<option value="created">Created</option>
						<option value="paused">Paused</option>
					</select>
					<button
						type="submit"
						className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white"
					>
						Filter
					</button>
				</form>
			</section>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="overflow-hidden rounded-xl border border-default/15">
					<table className="min-w-full divide-y divide-default/15 text-left">
						<thead className="bg-background/60 text-[11px] uppercase tracking-[0.18em] text-muted">
							<tr>
								<th className="px-4 py-3 font-medium">Name</th>
								<th className="px-4 py-3 font-medium">Image</th>
								<th className="px-4 py-3 font-medium">State</th>
								<th className="px-4 py-3 font-medium">Status</th>
								<th className="px-4 py-3 font-medium">Ports</th>
								<th className="px-4 py-3 font-medium">Size</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/10 bg-surface/40 text-sm">
							{filtered.length ? (
								filtered.map((container) => (
									<tr key={`${container.ID}-${container.Names}`}>
										<td className="px-4 py-3 font-medium">
											<div className="space-y-1">
												<Link
													href={`/dashboard/containers/${container.ID}`}
													className="transition-colors hover:text-accent"
												>
													{container.Names}
												</Link>
												{container.Labels?.includes("com.docker.compose.project=") ? (
													<p className="text-xs text-muted">
														Stack{" "}
														{container.Labels.split(",")
															.find((label) => label.startsWith("com.docker.compose.project="))
															?.split("=")
															.slice(1)
															.join("=")}
													</p>
												) : null}
											</div>
										</td>
										<td className="px-4 py-3 text-muted">{container.Image}</td>
										<td className="px-4 py-3">
											<StatusBadge status={(container.State || "offline").toLowerCase()} />
										</td>
										<td className="px-4 py-3 text-muted">{container.Status || "—"}</td>
										<td className="px-4 py-3">
											<RuntimePortLinks ports={container.Ports} compact />
										</td>
										<td className="px-4 py-3 text-muted">{container.Size || "—"}</td>
										<td className="px-4 py-3">
											<div className="flex flex-wrap gap-2">
												<Link
													href={`/dashboard/containers/${container.ID}`}
													className="inline-flex h-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 px-3 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
												>
													open
												</Link>
												{(["start", "stop", "restart", "remove"] as const).map((action) => (
													<form key={action} action={controlContainerAction}>
														<input type="hidden" name="containerId" value={container.ID} />
														<input type="hidden" name="action" value={action} />
														<FormSubmitButton
															label={action}
															pendingLabel={`${action}ing...`}
															className="inline-flex h-8 items-center justify-center rounded-lg border border-default/20 bg-background px-3 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
														/>
													</form>
												))}
												<Link
													href={`/dashboard/shell?target=container&containerId=${container.ID}`}
													className="inline-flex h-8 items-center justify-center rounded-lg border border-default/20 bg-background px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
												>
													shell
												</Link>
												<Link
													href={`/dashboard/logs?mode=single&container=${container.ID}`}
													className="inline-flex h-8 items-center justify-center rounded-lg border border-default/20 bg-background px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
												>
													logs
												</Link>
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
										No containers matched the current filters.
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
