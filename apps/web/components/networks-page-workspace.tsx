"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { InstantFilterToolbar } from "@/components/instant-filter-toolbar";
import { NetworksTableWorkspace } from "@/components/networks-table-workspace";
import { Panel } from "@/components/ui/panel";
import { matchesSearchQuery } from "@/lib/search";

type FormAction = (formData: FormData) => void | Promise<void>;
type NetworkRow = Record<string, string>;

export function NetworksPageWorkspace({
	networks,
	environmentId,
	removeNetworkAction,
	bulkRemoveNetworksAction,
	initialQuery = "",
}: {
	networks: NetworkRow[];
	environmentId: string;
	removeNetworkAction: FormAction;
	bulkRemoveNetworksAction: FormAction;
	initialQuery?: string;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [scopeFilter, setScopeFilter] = useState("all");
	const deferredQuery = useDeferredValue(query);

	const filteredNetworks = useMemo(
		() =>
			networks.filter((network) => {
				const scope = (network.Scope || "local").toLowerCase();
				const matchesScope = scopeFilter === "all" || scope === scopeFilter;
				return (
					matchesScope &&
					matchesSearchQuery(deferredQuery, network.Name, network.Driver, network.Scope, network.ID)
				);
			}),
		[deferredQuery, networks, scopeFilter],
	);

	return (
		<Panel>
			<InstantFilterToolbar
				searchId="network-list-search"
				searchPlaceholder="Search networks by name, driver, scope, or id"
				query={query}
				onQueryChange={setQuery}
				resultCount={filteredNetworks.length}
				totalCount={networks.length}
				onReset={() => {
					setQuery("");
					setScopeFilter("all");
				}}
				filters={[
					{
						id: "network-scope-filter",
						value: scopeFilter,
						onChange: setScopeFilter,
						className: "h-9 min-w-36 text-xs",
						options: [
							{ value: "all", label: "All scopes" },
							{ value: "local", label: "Local" },
							{ value: "swarm", label: "Swarm" },
							{ value: "global", label: "Global" },
						],
					},
				]}
			/>
			<NetworksTableWorkspace
				networks={filteredNetworks}
				environmentId={environmentId}
				removeNetworkAction={removeNetworkAction}
				bulkRemoveNetworksAction={bulkRemoveNetworksAction}
			/>
		</Panel>
	);
}
