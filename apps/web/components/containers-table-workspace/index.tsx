"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_COLUMNS } from "@/components/containers-table-workspace/columns";
import { useColumnVisibility } from "@/components/containers-table-workspace/hooks/use-column-visibility";
import { useContainerStats } from "@/components/containers-table-workspace/hooks/use-container-stats";
import { ContainersLiveConsoleDock } from "@/components/containers-table-workspace/live-console-dock";
import { ContainersTableRow } from "@/components/containers-table-workspace/row";
import { ContainersTableToolbar } from "@/components/containers-table-workspace/toolbar";
import type {
	ContainerRow,
	FormAction,
	UpdatePolicyRecord,
	UpdateStateRecord,
} from "@/components/containers-table-workspace/types";
import {
	DataTable,
	DataTableBody,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
} from "@/components/ui/data-table";
import { getSocket } from "@/lib/socket-client";

export function ContainersTableWorkspace({
	containers,
	environmentId,
	environmentKind = "local",
	managerUrl,
	controlContainerAction,
	bulkControlContainerAction,
	checkContainerUpdatesAction,
	bulkCheckContainerUpdatesAction,
	applyContainerUpdatesAction,
	bulkApplyContainerUpdatesAction,
	setContainerUpdatePolicyAction,
	protectedContainerIds,
	protectedContainerLabels,
	initialWatchStackId,
	updatePolicyMap,
	updateStateMap,
}: {
	containers: ContainerRow[];
	environmentId: string;
	environmentKind?: "local" | "agent";
	managerUrl?: string;
	controlContainerAction: FormAction;
	bulkControlContainerAction: FormAction;
	checkContainerUpdatesAction: FormAction;
	bulkCheckContainerUpdatesAction: FormAction;
	applyContainerUpdatesAction: FormAction;
	bulkApplyContainerUpdatesAction: FormAction;
	setContainerUpdatePolicyAction: FormAction;
	protectedContainerIds: string[];
	protectedContainerLabels: Record<string, string>;
	initialWatchStackId?: string;
	updatePolicyMap: UpdatePolicyRecord;
	updateStateMap: UpdateStateRecord;
}) {
	const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
	const [watchStackId, setWatchStackId] = useState(initialWatchStackId || "");
	const [logDockOpen, setLogDockOpen] = useState(Boolean(initialWatchStackId));
	const { visibleColumns, toggleColumn, isVisible } = useColumnVisibility();

	// Only subscribe to stats for running containers
	const runningContainerIds = useMemo(
		() => containers.filter((c) => (c.State || "").toLowerCase() === "running").map((c) => c.ID),
		[containers],
	);

	const { statsMap, loadingSet } = useContainerStats({
		containerIds: runningContainerIds,
		environmentId,
		environmentKind,
	});

	// Listen for deployment updates
	useEffect(() => {
		const client = getSocket();
		const onDeploymentUpdate = (event: { stackId?: string; status?: string }) => {
			if (!event?.stackId) return;
			if (event.status === "running" || event.status === "queued") {
				setWatchStackId(event.stackId);
				setLogDockOpen(true);
			}
		};
		client.on("deployment:update", onDeploymentUpdate);
		return () => {
			client.off("deployment:update", onDeploymentUpdate);
		};
	}, []);

	const protectedSet = useMemo(() => new Set(protectedContainerIds), [protectedContainerIds]);
	const selectableIds = useMemo(
		() => containers.map((container) => container.ID).filter((id) => !protectedSet.has(id)),
		[containers, protectedSet],
	);
	const selectedContainers = useMemo(
		() => containers.filter((container) => selectedIds[container.ID]),
		[containers, selectedIds],
	);
	const selectedPayload = selectedContainers.map((container) => container.ID);
	const selectedRunning = selectedContainers.filter(
		(container) => (container.State || "").toLowerCase() === "running",
	);
	const selectedStopped = selectedContainers.filter(
		(container) => (container.State || "").toLowerCase() !== "running",
	);
	const allSelectableSelected =
		selectableIds.length > 0 && selectableIds.every((containerId) => selectedIds[containerId]);
	const visibleCount = ALL_COLUMNS.filter((c) => visibleColumns.has(c.id)).length + 1;
	const handleSelectChange = useCallback((containerId: string, checked: boolean) => {
		setSelectedIds((current) => ({
			...current,
			[containerId]: checked,
		}));
	}, []);

	return (
		<>
			<ContainersTableToolbar
				selectedContainers={selectedContainers}
				selectedPayload={selectedPayload}
				selectedRunning={selectedRunning}
				selectedStopped={selectedStopped}
				environmentId={environmentId}
				bulkCheckContainerUpdatesAction={bulkCheckContainerUpdatesAction}
				bulkApplyContainerUpdatesAction={bulkApplyContainerUpdatesAction}
				bulkControlContainerAction={bulkControlContainerAction}
				visibleColumns={visibleColumns}
				toggleColumn={toggleColumn}
				watchStackId={watchStackId}
				logDockOpen={logDockOpen}
				setLogDockOpen={setLogDockOpen}
				clearSelection={() => setSelectedIds({})}
			/>

			<DataTable>
				<DataTableHeader>
					<tr>
						<DataTableHead className="w-8">
							<input
								type="checkbox"
								aria-label="Select all containers"
								checked={allSelectableSelected}
								onChange={(event) => {
									if (!event.target.checked) {
										setSelectedIds({});
										return;
									}
									setSelectedIds((current) => ({
										...current,
										...Object.fromEntries(selectableIds.map((id) => [id, true])),
									}));
								}}
								className="h-3.5 w-3.5 rounded border-default/30 bg-background"
							/>
						</DataTableHead>
						{isVisible("name") ? <DataTableHead>Name</DataTableHead> : null}
						{isVisible("image") ? <DataTableHead>Image</DataTableHead> : null}
						{isVisible("state") ? <DataTableHead>State</DataTableHead> : null}
						{isVisible("cpu") ? <DataTableHead>CPU</DataTableHead> : null}
						{isVisible("memory") ? <DataTableHead>Memory</DataTableHead> : null}
						{isVisible("uptime") ? <DataTableHead>Uptime</DataTableHead> : null}
						{isVisible("netio") ? <DataTableHead>Net I/O</DataTableHead> : null}
						{isVisible("ports") ? <DataTableHead>Ports</DataTableHead> : null}
						{isVisible("stack") ? <DataTableHead>Stack</DataTableHead> : null}
						{isVisible("updates") ? <DataTableHead>Updates</DataTableHead> : null}
						{isVisible("actions") ? (
							<DataTableHead className="w-24 text-right">Actions</DataTableHead>
						) : null}
					</tr>
				</DataTableHeader>
				<DataTableBody>
					{containers.length ? (
						containers.map((container) => (
							<ContainersTableRow
								key={`${container.ID}-${container.Names}`}
								container={container}
								environmentId={environmentId}
								managerUrl={managerUrl}
								isVisible={isVisible}
								isProtected={protectedSet.has(container.ID)}
								protectedLabel={protectedContainerLabels[container.ID]}
								isSelected={Boolean(selectedIds[container.ID])}
								onSelectChange={handleSelectChange}
								controlContainerAction={controlContainerAction}
								checkContainerUpdatesAction={checkContainerUpdatesAction}
								applyContainerUpdatesAction={applyContainerUpdatesAction}
								setContainerUpdatePolicyAction={setContainerUpdatePolicyAction}
								updatePolicyMap={updatePolicyMap}
								updateStateMap={updateStateMap}
								rowStats={statsMap[container.ID]}
								isLoading={loadingSet.has(container.ID)}
							/>
						))
					) : (
						<DataTableEmpty colSpan={visibleCount}>
							No containers matched the current filters.
						</DataTableEmpty>
					)}
				</DataTableBody>
			</DataTable>

			{logDockOpen && watchStackId ? (
				<ContainersLiveConsoleDock
					environmentId={environmentId}
					watchStackId={watchStackId}
					onClose={() => {
						setLogDockOpen(false);
						setWatchStackId("");
					}}
				/>
			) : null}
		</>
	);
}
