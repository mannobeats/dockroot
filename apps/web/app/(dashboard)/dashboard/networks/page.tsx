import { PageHeader } from "@/components/page-header";
import { listRuntimeResources } from "@/lib/platform";

export default async function NetworksPage() {
	const runtime = await listRuntimeResources();

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Networks"
				description="Docker network inventory from the manager host."
			/>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{runtime.networks.length ? (
					runtime.networks.map((network) => (
						<div
							key={`${network.ID}-${network.Name}`}
							className="rounded-[24px] border border-default/15 bg-surface/80 p-5"
						>
							<p className="text-sm font-semibold">{network.Name}</p>
							<p className="mt-1 text-sm text-muted">{network.Driver}</p>
							<p className="mt-4 text-xs text-muted">{network.Scope || "local"}</p>
						</div>
					))
				) : (
					<div className="rounded-[24px] border border-dashed border-default/20 bg-surface/80 p-6 text-sm text-muted">
						No networks found or Docker is unavailable.
					</div>
				)}
			</div>
		</div>
	);
}
