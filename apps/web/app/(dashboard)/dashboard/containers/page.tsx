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
				description="Live Docker runtime snapshot from the manager host. Remote agents will feed the same resource views through the same model."
			/>
			<div className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
				<div className="overflow-hidden rounded-[22px] border border-default/15">
					<table className="min-w-full divide-y divide-default/15 text-left">
						<thead className="bg-background/60 text-[11px] uppercase tracking-[0.18em] text-muted">
							<tr>
								<th className="px-4 py-3 font-medium">Container</th>
								<th className="px-4 py-3 font-medium">Image</th>
								<th className="px-4 py-3 font-medium">State</th>
								<th className="px-4 py-3 font-medium">Ports</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/10 bg-surface/40 text-sm">
							{runtime.containers.length ? (
								runtime.containers.map((container) => (
									<tr key={`${container.ID}-${container.Names}`}>
										<td className="px-4 py-3 font-medium">{container.Names}</td>
										<td className="px-4 py-3 text-muted">{container.Image}</td>
										<td className="px-4 py-3">
											<StatusBadge status={(container.State || "offline").toLowerCase()} />
										</td>
										<td className="px-4 py-3 text-muted">{container.Ports || "—"}</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
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
