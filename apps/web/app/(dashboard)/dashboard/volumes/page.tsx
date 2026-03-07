import { PageHeader } from "@/components/page-header";
import { listRuntimeResources } from "@/lib/platform";

export default async function VolumesPage() {
	const runtime = await listRuntimeResources();

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Volumes"
				description="Persistent volume inventory from the local Docker engine."
			/>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{runtime.volumes.length ? (
					runtime.volumes.map((volume) => (
						<div
							key={`${volume.Name}-${volume.Driver}`}
							className="rounded-[24px] border border-default/15 bg-surface/80 p-5"
						>
							<p className="text-sm font-semibold">{volume.Name}</p>
							<p className="mt-1 text-sm text-muted">{volume.Driver}</p>
							<p className="mt-4 text-xs text-muted">{volume.Mountpoint || "Managed by Docker"}</p>
						</div>
					))
				) : (
					<div className="rounded-[24px] border border-dashed border-default/20 bg-surface/80 p-6 text-sm text-muted">
						No volumes found or Docker is unavailable.
					</div>
				)}
			</div>
		</div>
	);
}
