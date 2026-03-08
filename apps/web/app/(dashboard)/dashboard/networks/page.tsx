import Link from "next/link";
import {
	createNetworkAction,
	pruneNetworksAction,
	removeNetworkAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
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
			<Panel padding="sm">
				<div className="flex flex-col gap-3 lg:flex-row">
					<form className="flex flex-1 gap-3">
						<Input type="search" name="q" defaultValue={params.q || ""} placeholder="Search networks..." className="flex-1" />
						<Button type="submit" variant="secondary">
							Filter
						</Button>
					</form>
					<form action={createNetworkAction} className="flex gap-3">
						<input type="hidden" name="environmentId" value={environment.id} />
						<Input type="text" name="name" required placeholder="app-network" />
						<Select name="driver" defaultValue="bridge">
							<option value="bridge">bridge</option>
							<option value="overlay">overlay</option>
							<option value="macvlan">macvlan</option>
							<option value="host">host</option>
						</Select>
						<FormSubmitButton label="Create" pendingLabel="Creating..." />
					</form>
					<form action={pruneNetworksAction}>
						<input type="hidden" name="environmentId" value={environment.id} />
						<FormSubmitButton label="Prune" pendingLabel="Pruning..." variant="outline" />
					</form>
				</div>
			</Panel>

			{/* Stats */}
			<div className="grid gap-4 sm:grid-cols-3">
				<MetricCard label="Total" value={filtered.length} />
				<MetricCard label="Bridge" value={bridgeCount} />
				<MetricCard label="Other drivers" value={filtered.length - bridgeCount} />
			</div>

			{/* Table */}
			<Panel>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Driver</DataTableHead>
							<DataTableHead>Scope</DataTableHead>
							<DataTableHead>Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
							{filtered.length ? (
								filtered.map((network: Record<string, string>) => (
									<DataTableRow key={`${network.ID}-${network.Name}`}>
										<DataTableCell>
											<Link
												href={`/dashboard/networks/${encodeURIComponent(network.Name)}?environment=${environment.id}`}
												className="font-medium transition-colors hover:text-foreground/80"
											>
												{network.Name}
											</Link>
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">{network.Driver}</DataTableCell>
										<DataTableCell className="text-xs text-muted">{network.Scope || "local"}</DataTableCell>
										<DataTableCell>
											<div className="flex gap-1.5">
												<LinkButton
													href={`/dashboard/networks/${encodeURIComponent(network.Name)}?environment=${environment.id}`}
													variant="outline"
													size="xs"
												>
													Details
												</LinkButton>
												<form action={removeNetworkAction}>
													<input type="hidden" name="name" value={network.Name} />
													<input type="hidden" name="environmentId" value={environment.id} />
													<FormSubmitButton
														label="Delete"
														pendingLabel="Deleting..."
														variant="danger"
														size="xs"
													/>
												</form>
											</div>
										</DataTableCell>
									</DataTableRow>
								))
							) : (
								<DataTableEmpty colSpan={4}>No networks found.</DataTableEmpty>
							)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
