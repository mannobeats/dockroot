"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { InstantFilterToolbar } from "@/components/instant-filter-toolbar";
import { StacksBulkActions } from "@/components/stacks-table-workspace/bulk-actions";
import { StacksLiveConsoleDock } from "@/components/stacks-table-workspace/live-console-dock";
import { StacksTableRow } from "@/components/stacks-table-workspace/row";
import type {
	StacksTableWorkspaceProps,
	TrackedStackRow,
	UntrackedStackRow,
} from "@/components/stacks-table-workspace/types";
import {
	DataTable,
	DataTableBody,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
} from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { matchesSearchQuery } from "@/lib/search";
import { getSocket } from "@/lib/socket-client";

export function StacksTableWorkspace({
	stacks,
	includeUntracked,
	environmentId,
	initialWatchStackId,
	deployStackAction,
	destroyStackAction,
	adoptComposeProjectAction,
	controlComposeProjectAction,
	bulkRestartStacksAction,
	bulkStopStacksAction,
	bulkDestroyStacksAction,
	bulkRemoveStacksAction,
}: StacksTableWorkspaceProps) {
	const router = useRouter();
	const [search, setSearch] = useState("");
	const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
	const [selectedRowKeys, setSelectedRowKeys] = useState<Record<string, boolean>>({});
	const [watchedStackId, setWatchedStackId] = useState(initialWatchStackId || "");
	const [logDockOpen, setLogDockOpen] = useState(Boolean(initialWatchStackId));

	useEffect(() => {
		const client = getSocket();
		const onDeploymentUpdate = (event: { stackId?: string; status?: string }) => {
			if (!event?.stackId) {
				return;
			}
			if (event.status === "running" || event.status === "queued") {
				setWatchedStackId(event.stackId);
				setLogDockOpen(true);
			}
			router.refresh();
		};

		client.on("deployment:update", onDeploymentUpdate);
		return () => {
			client.off("deployment:update", onDeploymentUpdate);
		};
	}, [router]);

	const filteredStacks = useMemo(() => {
		return stacks.filter((stack) =>
			matchesSearchQuery(
				search,
				stack.name,
				stack.slug,
				stack.environmentName,
				stack.status,
				stack.sourceType,
				stack.type === "untracked" ? stack.configFiles : [],
				stack.containers.map((container) => [container.Names, container.Image, container.State]),
			),
		);
	}, [search, stacks]);

	const selectableRowKeys = useMemo(
		() =>
			filteredStacks
				.filter((stack) => !stack.isProtected)
				.map((stack) => `${stack.type}-${stack.slug}`),
		[filteredStacks],
	);

	const selectedStacks = useMemo(
		() =>
			filteredStacks.filter((stack) => {
				const rowKey = `${stack.type}-${stack.slug}`;
				return Boolean(selectedRowKeys[rowKey]);
			}),
		[filteredStacks, selectedRowKeys],
	);

	const selectedTracked = selectedStacks.filter(
		(stack): stack is TrackedStackRow => stack.type === "tracked" && Boolean(stack.stackId),
	);
	const selectedUntracked = selectedStacks.filter(
		(stack): stack is UntrackedStackRow => stack.type === "untracked",
	);
	const selectedUntrackedPayload = JSON.stringify(
		selectedUntracked.map((stack) => ({
			projectName: stack.slug,
			configFiles: stack.configFiles,
		})),
	);
	const selectedTrackedIds = selectedTracked.map((stack) => stack.stackId);
	const selectedCount = selectedStacks.length;
	const watchedStack = stacks.find(
		(stack): stack is TrackedStackRow =>
			stack.type === "tracked" && stack.stackId === watchedStackId,
	);
	const fallbackWatchedStack =
		watchedStack ||
		stacks.find((stack): stack is TrackedStackRow => stack.type === "tracked") ||
		null;
	const liveTargetStack = watchedStack || fallbackWatchedStack;
	const allSelectableSelected =
		selectableRowKeys.length > 0 && selectableRowKeys.every((rowKey) => selectedRowKeys[rowKey]);
	const firstTrackedId = selectedTracked[0]?.stackId;

	const handleAfterRuntimeAction = (stackId?: string) => {
		setSelectedRowKeys({});
		if (stackId) {
			setWatchedStackId(stackId);
			setLogDockOpen(true);
		}
	};

	return (
		<Panel>
			<InstantFilterToolbar
				searchId="stack-list-search"
				searchPlaceholder="Search stacks by name, slug, environment, or container"
				query={search}
				onQueryChange={setSearch}
				resultCount={filteredStacks.length}
				totalCount={stacks.length}
				onReset={() => setSearch("")}
			/>
			<StacksBulkActions
				selectedCount={selectedCount}
				selectedTrackedIds={selectedTrackedIds}
				selectedUntrackedPayload={selectedUntrackedPayload}
				firstTrackedId={firstTrackedId}
				bulkRestartStacksAction={bulkRestartStacksAction}
				bulkStopStacksAction={bulkStopStacksAction}
				bulkDestroyStacksAction={bulkDestroyStacksAction}
				bulkRemoveStacksAction={bulkRemoveStacksAction}
				onAfterRuntimeAction={handleAfterRuntimeAction}
				onAfterRemoveAction={() => setSelectedRowKeys({})}
				onClearSelection={() => setSelectedRowKeys({})}
				liveTargetAvailable={Boolean(liveTargetStack)}
				logDockOpen={logDockOpen}
				onToggleLogDock={() => setLogDockOpen((open) => !open)}
			/>

			<DataTable>
				<DataTableHeader>
					<tr>
						<DataTableHead className="w-8">
							<input
								type="checkbox"
								aria-label="Select all stacks"
								checked={allSelectableSelected}
								onChange={(event) => {
									if (!event.target.checked) {
										setSelectedRowKeys({});
										return;
									}
									setSelectedRowKeys((current) => ({
										...current,
										...Object.fromEntries(selectableRowKeys.map((rowKey) => [rowKey, true])),
									}));
								}}
								className="h-3.5 w-3.5 rounded border-default/30 bg-background"
							/>
						</DataTableHead>
						<DataTableHead className="w-8" />
						<DataTableHead>Name</DataTableHead>
						<DataTableHead>Status</DataTableHead>
						<DataTableHead>Source</DataTableHead>
						<DataTableHead>Environment</DataTableHead>
						<DataTableHead>Containers</DataTableHead>
						<DataTableHead className="w-28 text-right">Actions</DataTableHead>
					</tr>
				</DataTableHeader>
				<DataTableBody>
					{filteredStacks.length ? (
						filteredStacks.map((stack) => {
							const rowKey = `${stack.type}-${stack.slug}`;
							return (
								<StacksTableRow
									key={rowKey}
									stack={stack}
									rowKey={rowKey}
									expanded={Boolean(expandedRows[rowKey])}
									isSelected={Boolean(selectedRowKeys[rowKey])}
									includeUntracked={includeUntracked}
									environmentId={environmentId}
									onToggleExpanded={() =>
										setExpandedRows((current) => ({
											...current,
											[rowKey]: !current[rowKey],
										}))
									}
									onSelectChange={(checked) =>
										setSelectedRowKeys((current) => ({
											...current,
											[rowKey]: checked,
										}))
									}
									onWatchStack={(stackId) => {
										setWatchedStackId(stackId);
										setLogDockOpen(true);
									}}
									deployStackAction={deployStackAction}
									destroyStackAction={destroyStackAction}
									adoptComposeProjectAction={adoptComposeProjectAction}
									controlComposeProjectAction={controlComposeProjectAction}
								/>
							);
						})
					) : (
						<DataTableEmpty colSpan={8}>No stacks found.</DataTableEmpty>
					)}
				</DataTableBody>
			</DataTable>

			{logDockOpen && liveTargetStack ? (
				<StacksLiveConsoleDock
					stack={liveTargetStack}
					environmentId={environmentId}
					onClose={() => setLogDockOpen(false)}
				/>
			) : null}
		</Panel>
	);
}
