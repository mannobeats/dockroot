import Link from "next/link";
import {
	createNetworkAction,
	pruneNetworksAction,
	removeNetworkAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { listNetworks } from "@/lib/platform/docker";

export default async function NetworksPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; network?: string }>;
}) {
	await requirePrivilegedPageSession();
	const params = await searchParams;
	const query = (params.q || "").toLowerCase();
	const networks = await listNetworks();
	const filtered = networks.filter((network) =>
		!query
			? true
			: `${network.Name} ${network.Driver} ${network.Scope}`.toLowerCase().includes(query),
	);
	const bridgeCount = filtered.filter((network) => network.Driver === "bridge").length;

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

			<section className="grid gap-4 lg:grid-cols-3">
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Visible networks</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{filtered.length}</p>
					<p className="mt-2 text-sm text-muted">
						Isolated Docker segments available for workloads.
					</p>
				</div>
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Bridge networks</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{bridgeCount}</p>
					<p className="mt-2 text-sm text-muted">Default bridge style routing on this host.</p>
				</div>
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Other drivers</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">
						{filtered.length - bridgeCount}
					</p>
					<p className="mt-2 text-sm text-muted">
						Host, overlay, macvlan, and specialized networks.
					</p>
				</div>
			</section>

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
											<Link
												href={`/dashboard/networks/${encodeURIComponent(network.Name)}`}
												className="transition-colors hover:text-accent"
											>
												{network.Name}
											</Link>
										</td>
										<td className="px-4 py-3 text-muted">{network.Driver}</td>
										<td className="px-4 py-3 text-muted">{network.Scope || "local"}</td>
										<td className="px-4 py-3">
											<div className="flex flex-wrap gap-2">
												<Link
													href={`/dashboard/networks/${encodeURIComponent(network.Name)}`}
													className="inline-flex h-8 items-center justify-center rounded-lg border border-default/20 bg-background px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
												>
													Details
												</Link>
												<form action={removeNetworkAction}>
													<input type="hidden" name="name" value={network.Name} />
													<FormSubmitButton
														label="Delete"
														pendingLabel="Deleting..."
														className="inline-flex h-8 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-medium text-danger"
													/>
												</form>
											</div>
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
		</div>
	);
}
