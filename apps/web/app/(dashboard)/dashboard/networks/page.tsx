import {
	createNetworkAction,
	pruneNetworksAction,
	removeNetworkAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { getNetworkDetails, listNetworks } from "@/lib/platform/docker";

export default async function NetworksPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; network?: string }>;
}) {
	const params = await searchParams;
	const query = (params.q || "").toLowerCase();
	const networks = await listNetworks();
	const filtered = networks.filter((network) =>
		!query
			? true
			: `${network.Name} ${network.Driver} ${network.Scope}`.toLowerCase().includes(query),
	);
	const selectedName = params.network || filtered[0]?.Name || "";
	const selectedNetwork = selectedName ? await getNetworkDetails(selectedName) : null;

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Networks"
				description="Create, inspect, and remove Docker networks on the manager host."
			/>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="grid gap-3 xl:grid-cols-[1fr_auto_auto]">
					<form className="grid gap-3 md:grid-cols-[1fr_auto]">
						<input
							type="search"
							name="q"
							defaultValue={params.q || ""}
							placeholder="Search networks"
							className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						/>
						<button
							type="submit"
							className="inline-flex h-11 items-center justify-center rounded-xl border border-default/15 bg-background px-4 text-sm font-medium"
						>
							Filter
						</button>
					</form>
					<form action={createNetworkAction} className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
						<input
							type="text"
							name="name"
							required
							placeholder="app-network"
							className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						/>
						<select
							name="driver"
							defaultValue="bridge"
							className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						>
							<option value="bridge">bridge</option>
							<option value="overlay">overlay</option>
							<option value="macvlan">macvlan</option>
							<option value="host">host</option>
						</select>
						<FormSubmitButton label="Create" pendingLabel="Creating..." />
					</form>
					<form action={pruneNetworksAction}>
						<FormSubmitButton label="Prune unused" pendingLabel="Pruning..." />
					</form>
				</div>
			</section>

			<div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="overflow-hidden rounded-xl border border-default/15">
						<table className="min-w-full divide-y divide-default/15 text-left">
							<thead className="bg-background/60 text-[11px] uppercase tracking-[0.18em] text-muted">
								<tr>
									<th className="px-4 py-3 font-medium">Name</th>
									<th className="px-4 py-3 font-medium">Driver</th>
									<th className="px-4 py-3 font-medium">Scope</th>
									<th className="px-4 py-3 font-medium">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-default/10 bg-surface/40 text-sm">
								{filtered.length ? (
									filtered.map((network) => (
										<tr key={`${network.ID}-${network.Name}`}>
											<td className="px-4 py-3 font-medium">
												<a
													href={`/dashboard/networks?network=${encodeURIComponent(network.Name)}`}
													className="transition-colors hover:text-accent"
												>
													{network.Name}
												</a>
											</td>
											<td className="px-4 py-3 text-muted">{network.Driver}</td>
											<td className="px-4 py-3 text-muted">{network.Scope || "local"}</td>
											<td className="px-4 py-3">
												<form action={removeNetworkAction}>
													<input type="hidden" name="name" value={network.Name} />
													<FormSubmitButton
														label="Delete"
														pendingLabel="Deleting..."
														className="inline-flex h-8 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-medium text-danger"
													/>
												</form>
											</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
											No networks matched the current filters.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</section>

				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<h2 className="text-lg font-semibold tracking-tight">Network inspection</h2>
					{selectedNetwork ? (
						<pre className="mt-4 max-h-[620px] overflow-auto rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/85">
							{JSON.stringify(selectedNetwork, null, 2)}
						</pre>
					) : (
						<div className="mt-4 rounded-xl border border-dashed border-default/20 bg-background/60 p-6 text-sm text-muted">
							Select a network to inspect it.
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
