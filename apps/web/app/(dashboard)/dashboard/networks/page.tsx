import {
	bulkRemoveNetworksAction,
	createNetworkAction,
	pruneNetworksAction,
	removeNetworkAction,
} from "@/app/(dashboard)/actions";
import { CreateNetworkModal } from "@/components/create-network-modal";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { NetworksTableWorkspace } from "@/components/networks-table-workspace";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
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

				<NetworksTableWorkspace
					networks={filtered as Array<Record<string, string>>}
					environmentId={environment.id}
					removeNetworkAction={removeNetworkAction}
					bulkRemoveNetworksAction={bulkRemoveNetworksAction}
				/>
			</Panel>
		</div>
	);
}
