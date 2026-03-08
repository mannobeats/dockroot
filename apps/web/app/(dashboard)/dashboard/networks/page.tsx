import Link from "next/link";
import {
	createNetworkAction,
	pruneNetworksAction,
	removeNetworkAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { listNetworksForEnvironment, resolveRuntimeEnvironment } from "@/lib/environment-runtime";

export default async function NetworksPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; network?: string; environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(session.userId, params.environment);
	const query = (params.q || "").toLowerCase();
	const { networks } = await listNetworksForEnvironment(session.userId, environment.id);
	const filtered = networks.filter((network: Record<string, string>) =>
		!query
			? true
			: `${network.Name} ${network.Driver} ${network.Scope}`.toLowerCase().includes(query),
	);
	const bridgeCount = filtered.filter(
		(network: Record<string, string>) => network.Driver === "bridge",
	).length;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Networks"
				description={`${environment.name} — ${filtered.length} networks`}
			/>

			{/* Actions */}
			<div className="rounded-xl border border-default/10 bg-surface p-4">
				<div className="flex flex-col gap-3 lg:flex-row">
					<form className="flex flex-1 gap-3">
						<input
							type="search"
							name="q"
							defaultValue={params.q || ""}
							placeholder="Search networks..."
							className="h-9 flex-1 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
						<button type="submit" className="inline-flex h-9 items-center rounded-lg border border-default/10 px-3 text-sm font-medium">
							Filter
						</button>
					</form>
					<form action={createNetworkAction} className="flex gap-3">
						<input type="hidden" name="environmentId" value={environment.id} />
						<input
							type="text"
							name="name"
							required
							placeholder="app-network"
							className="h-9 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
						<select
							name="driver"
							defaultValue="bridge"
							className="h-9 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none"
						>
							<option value="bridge">bridge</option>
							<option value="overlay">overlay</option>
							<option value="macvlan">macvlan</option>
							<option value="host">host</option>
						</select>
						<FormSubmitButton label="Create" pendingLabel="Creating..." className="inline-flex h-9 items-center rounded-lg bg-foreground px-3 text-sm font-medium text-background" />
					</form>
					<form action={pruneNetworksAction}>
						<input type="hidden" name="environmentId" value={environment.id} />
						<FormSubmitButton label="Prune" pendingLabel="Pruning..." className="inline-flex h-9 items-center rounded-lg border border-default/10 px-3 text-sm font-medium text-muted transition-colors hover:text-foreground" />
					</form>
				</div>
			</div>

			{/* Stats */}
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Total</p>
					<p className="mt-1 text-2xl font-semibold">{filtered.length}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Bridge</p>
					<p className="mt-1 text-2xl font-semibold">{bridgeCount}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Other drivers</p>
					<p className="mt-1 text-2xl font-semibold">{filtered.length - bridgeCount}</p>
				</div>
			</div>

			{/* Table */}
			<div className="rounded-xl border border-default/10 bg-surface">
				<div className="table-scroll">
					<table className="min-w-full text-left text-sm">
						<thead>
							<tr className="border-b border-default/10 text-xs text-muted">
								<th className="px-4 py-3 font-medium">Name</th>
								<th className="px-4 py-3 font-medium">Driver</th>
								<th className="px-4 py-3 font-medium">Scope</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/5">
							{filtered.length ? (
								filtered.map((network: Record<string, string>) => (
									<tr key={`${network.ID}-${network.Name}`} className="transition-colors hover:bg-foreground/[0.02]">
										<td className="px-4 py-3">
											<Link
												href={`/dashboard/networks/${encodeURIComponent(network.Name)}?environment=${environment.id}`}
												className="font-medium transition-colors hover:text-foreground/80"
											>
												{network.Name}
											</Link>
										</td>
										<td className="px-4 py-3 text-xs text-muted">{network.Driver}</td>
										<td className="px-4 py-3 text-xs text-muted">{network.Scope || "local"}</td>
										<td className="px-4 py-3">
											<div className="flex gap-1.5">
												<Link
													href={`/dashboard/networks/${encodeURIComponent(network.Name)}?environment=${environment.id}`}
													className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
												>
													Details
												</Link>
												<form action={removeNetworkAction}>
													<input type="hidden" name="name" value={network.Name} />
													<input type="hidden" name="environmentId" value={environment.id} />
													<FormSubmitButton
														label="Delete"
														pendingLabel="Deleting..."
														className="inline-flex h-7 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
													/>
												</form>
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={4} className="px-4 py-12 text-center text-sm text-muted">
										No networks found.
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
