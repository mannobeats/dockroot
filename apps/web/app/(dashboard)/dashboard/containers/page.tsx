import Link from "next/link";
import { controlContainerAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveRuntimePanel } from "@/components/live-runtime-panel";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listRuntimeResources } from "@/lib/platform";

export default async function ContainersPage() {
	const runtime = await listRuntimeResources();

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Containers"
				description="Live Docker runtime snapshot from the manager host. Use stop, start, and restart directly from the manager."
			/>
			<LiveRuntimePanel />
			<div className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="overflow-hidden rounded-xl border border-default/15">
					<table className="min-w-full divide-y divide-default/15 text-left">
						<thead className="bg-background/60 text-[11px] uppercase tracking-[0.18em] text-muted">
							<tr>
								<th className="px-4 py-3 font-medium">Container</th>
								<th className="px-4 py-3 font-medium">Image</th>
								<th className="px-4 py-3 font-medium">State</th>
								<th className="px-4 py-3 font-medium">Ports</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/10 bg-surface/40 text-sm">
							{runtime.containers.length ? (
								runtime.containers.map((container) => (
									<tr key={`${container.ID}-${container.Names}`}>
										<td className="px-4 py-3 font-medium">
											<Link
												href={`/dashboard/containers/${container.ID}`}
												className="transition-colors hover:text-accent"
											>
												{container.Names}
											</Link>
										</td>
										<td className="px-4 py-3 text-muted">{container.Image}</td>
										<td className="px-4 py-3">
											<StatusBadge status={(container.State || "offline").toLowerCase()} />
										</td>
										<td className="px-4 py-3 text-muted">{container.Ports || "—"}</td>
										<td className="px-4 py-3">
											<div className="flex flex-wrap gap-2">
												{(["start", "stop", "restart"] as const).map((action) => (
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
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
										No containers found or Docker is unavailable.
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
