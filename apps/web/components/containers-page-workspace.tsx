"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ContainersTableWorkspace } from "@/components/containers-table-workspace";
import { InstantFilterToolbar } from "@/components/instant-filter-toolbar";
import { Panel } from "@/components/ui/panel";
import { matchesSearchQuery } from "@/lib/search";

type FormAction = (formData: FormData) => void | Promise<void>;
type ContainerRow = Record<string, string>;

export function ContainersPageWorkspace({
	containers,
	environmentId,
	managerUrl,
	controlContainerAction,
	bulkControlContainerAction,
	checkContainerUpdatesAction,
	bulkCheckContainerUpdatesAction,
	applyContainerUpdatesAction,
	bulkApplyContainerUpdatesAction,
	setContainerUpdatePolicyAction,
	protectedContainerLabels,
	initialWatchStackId,
	updatePolicyMap,
	updateStateMap,
	initialQuery = "",
	initialStatus = "all",
}: {
	containers: ContainerRow[];
	environmentId: string;
	managerUrl?: string;
	controlContainerAction: FormAction;
	bulkControlContainerAction: FormAction;
	checkContainerUpdatesAction: FormAction;
	bulkCheckContainerUpdatesAction: FormAction;
	applyContainerUpdatesAction: FormAction;
	bulkApplyContainerUpdatesAction: FormAction;
	setContainerUpdatePolicyAction: FormAction;
	protectedContainerLabels: Record<string, string>;
	initialWatchStackId?: string;
	updatePolicyMap: Record<string, { checkEnabled: boolean; updateEnabled: boolean }>;
	updateStateMap: Record<
		string,
		{
			updateAvailable: boolean;
			majorUpdateAvailable: boolean;
			majorTargetImageRef?: string | null;
			majorTargetTag?: string | null;
			lastResult: string | null;
			lastError?: string | null;
			checkedAt: string | Date | null;
			updatedAt: string | Date | null;
		}
	>;
	initialQuery?: string;
	initialStatus?: string;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [status, setStatus] = useState(initialStatus);
	const deferredQuery = useDeferredValue(query);

	const filteredContainers = useMemo(
		() =>
			containers.filter((container) => {
				const matchesStatus =
					status === "all" || (container.State || "").toLowerCase() === status.toLowerCase();
				const matchesQueryValue = matchesSearchQuery(
					deferredQuery,
					container.Names,
					container.Name,
					container.Image,
					container.ID,
					container.Status,
					container.State,
					container.Labels,
				);
				return matchesStatus && matchesQueryValue;
			}),
		[containers, deferredQuery, status],
	);

	const filteredProtectedIds = useMemo(
		() =>
			filteredContainers
				.map((container) => container.ID)
				.filter((id) => Boolean(protectedContainerLabels[id])),
		[filteredContainers, protectedContainerLabels],
	);

	return (
		<Panel>
			<InstantFilterToolbar
				searchId="container-list-search"
				searchPlaceholder="Search containers by name, image, state, or stack"
				query={query}
				onQueryChange={setQuery}
				resultCount={filteredContainers.length}
				totalCount={containers.length}
				onReset={() => {
					setQuery("");
					setStatus("all");
				}}
				filters={[
					{
						id: "container-status-filter",
						value: status,
						onChange: setStatus,
						className: "h-7 min-w-36 text-xs",
						options: [
							{ value: "all", label: "All statuses" },
							{ value: "running", label: "Running" },
							{ value: "exited", label: "Exited" },
							{ value: "created", label: "Created" },
							{ value: "paused", label: "Paused" },
						],
					},
				]}
			/>
			<ContainersTableWorkspace
				containers={filteredContainers}
				environmentId={environmentId}
				managerUrl={managerUrl}
				controlContainerAction={controlContainerAction}
				bulkControlContainerAction={bulkControlContainerAction}
				checkContainerUpdatesAction={checkContainerUpdatesAction}
				bulkCheckContainerUpdatesAction={bulkCheckContainerUpdatesAction}
				applyContainerUpdatesAction={applyContainerUpdatesAction}
				bulkApplyContainerUpdatesAction={bulkApplyContainerUpdatesAction}
				setContainerUpdatePolicyAction={setContainerUpdatePolicyAction}
				protectedContainerIds={filteredProtectedIds}
				protectedContainerLabels={protectedContainerLabels}
				initialWatchStackId={initialWatchStackId}
				updatePolicyMap={updatePolicyMap}
				updateStateMap={updateStateMap}
			/>
		</Panel>
	);
}
