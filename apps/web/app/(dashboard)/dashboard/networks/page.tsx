import { ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import {
	createNetworkAction,
	pruneNetworksAction,
	removeNetworkAction,
} from "@/app/(dashboard)/actions";
import { CreateNetworkModal } from "@/components/create-network-modal";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { PageHeader } from "@/components/page-header";
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
import { Panel } from "@/components/ui/panel";
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

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Networks"
				description={`${environment.name} · ${filtered.length} networks`}
				actions={
					<div className="flex items-center gap-1.5">
						<DestructiveActionModal
							action={pruneNetworksAction}
							title="Prune unused networks"
							description="This removes unused Docker networks."
							triggerLabel="Prune"
							confirmLabel="Prune"
							pendingLabel="Pruning..."
							triggerVariant="outline"
							triggerSize="xs"
							hiddenFields={{ environmentId: environment.id }}
						/>
						<CreateNetworkModal action={createNetworkAction} environmentId={environment.id} />
					</div>
				}
			/>

			<Panel>
				<form className="border-b border-default/8 px-3 py-2">
					<Input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search networks..."
						className="border-0 bg-transparent shadow-none focus:ring-0"
					/>
				</form>

				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Driver</DataTableHead>
							<DataTableHead>Scope</DataTableHead>
							<DataTableHead className="w-16 text-right">Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{filtered.length ? (
							filtered.map((network: Record<string, string>) => (
								<DataTableRow key={`${network.ID}-${network.Name}`}>
									<DataTableCell>
										<Link
											href={`/dashboard/networks/${encodeURIComponent(network.Name)}?environment=${environment.id}`}
											className="font-medium transition-colors hover:text-accent"
										>
											{network.Name}
										</Link>
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">{network.Driver}</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{network.Scope || "local"}
									</DataTableCell>
									<DataTableCell>
										<div className="flex items-center justify-end gap-0.5">
											<LinkButton
												href={`/dashboard/networks/${encodeURIComponent(network.Name)}?environment=${environment.id}`}
												variant="ghost"
												size="icon-xs"
												title="Details"
											>
												<ExternalLink className="h-3.5 w-3.5" />
											</LinkButton>
											<DestructiveActionModal
												action={removeNetworkAction}
												title={`Delete network ${network.Name}`}
												description="This permanently removes the Docker network."
												triggerLabel=""
												confirmLabel="Delete"
												pendingLabel="Deleting..."
												triggerVariant="ghost"
												triggerSize="xs"
												hiddenFields={{ name: network.Name, environmentId: environment.id }}
												triggerClassName="h-6 w-6 p-0 text-muted hover:text-danger"
												triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
											/>
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
