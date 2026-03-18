"use client";

import {
	ChevronDown,
	ChevronRight,
	ExternalLink,
	Lock,
	Play,
	RefreshCw,
	RotateCcw,
	Square,
	Trash2,
	Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { InstantFilterToolbar } from "@/components/instant-filter-toolbar";
import { StacksBulkActions } from "@/components/stacks-table-workspace/bulk-actions";
import { StacksLiveConsoleDock } from "@/components/stacks-table-workspace/live-console-dock";
import type {
	StacksTableWorkspaceProps,
	TrackedStackRow,
	UntrackedStackRow,
} from "@/components/stacks-table-workspace/types";
import {
	getContainerImage,
	getContainerName,
	getContainerState,
	isRunningStack,
	normalizeStatus,
} from "@/components/stacks-table-workspace/utils";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { getProtectedStackLabel } from "@/lib/runtime-protection";
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
							const expanded = Boolean(expandedRows[rowKey]);
							const detailEnvironmentSuffix = environmentId ? `?environment=${environmentId}` : "";
							const protectedLabel = getProtectedStackLabel(stack.slug);

							return (
								<Fragment key={rowKey}>
									<DataTableRow className="align-top">
										<DataTableCell>
											<input
												type="checkbox"
												aria-label={`Select ${stack.name}`}
												disabled={stack.isProtected}
												checked={Boolean(selectedRowKeys[rowKey])}
												onChange={(event) =>
													setSelectedRowKeys((current) => ({
														...current,
														[rowKey]: event.target.checked,
													}))
												}
												className="h-3.5 w-3.5 rounded border-default/30 bg-background"
											/>
										</DataTableCell>
										<DataTableCell>
											<button
												type="button"
												onClick={() =>
													setExpandedRows((current) => ({
														...current,
														[rowKey]: !current[rowKey],
													}))
												}
												className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
												aria-label={expanded ? "Collapse stack services" : "Expand stack services"}
											>
												{expanded ? (
													<ChevronDown className="h-3.5 w-3.5" />
												) : (
													<ChevronRight className="h-3.5 w-3.5" />
												)}
											</button>
										</DataTableCell>
										<DataTableCell>
											<div className="flex items-center gap-1.5">
												<span className="font-medium">{stack.name}</span>
												{stack.isProtected ? (
													<Badge title={protectedLabel || undefined} variant="warning">
														<Lock className="h-2.5 w-2.5" />
													</Badge>
												) : null}
											</div>
											<p className="text-[11px] text-muted">{stack.slug}</p>
										</DataTableCell>
										<DataTableCell>
											<StatusBadge
												status={
													stack.type === "tracked" ? stack.status : normalizeStatus(stack.status)
												}
											/>
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">
											{stack.type === "tracked" ? "Internal" : "Untracked"}
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">
											{stack.environmentName || "—"}
										</DataTableCell>
										<DataTableCell>
											<span className="text-sm font-medium tabular-nums">
												{stack.runningCount}/{stack.containerCount}
											</span>
										</DataTableCell>
										<DataTableCell>
											<div className="flex items-center justify-end gap-1">
												{stack.type === "tracked" ? (
													<>
														<form
															action={deployStackAction}
															onSubmit={() => {
																setWatchedStackId(stack.stackId);
																setLogDockOpen(true);
															}}
														>
															<input type="hidden" name="stackId" value={stack.stackId || ""} />
															<FormSubmitButton
																label=""
																pendingLabel=""
																size="xs"
																variant="ghost"
																disabled={stack.isProtected}
																title={
																	isRunningStack(stack.status, stack.runningCount)
																		? "Redeploy"
																		: "Deploy"
																}
																className="h-7 w-7 p-0"
															>
																{isRunningStack(stack.status, stack.runningCount) ? (
																	<RotateCcw className="h-3.5 w-3.5" />
																) : (
																	<Play className="h-3.5 w-3.5" />
																)}
															</FormSubmitButton>
														</form>
														<DestructiveActionModal
															action={destroyStackAction}
															onConfirm={() => {
																setWatchedStackId(stack.stackId);
																setLogDockOpen(true);
															}}
															title={`Destroy stack ${stack.name}`}
															description="This will stop and remove the stack resources."
															triggerLabel=""
															confirmLabel="Destroy"
															pendingLabel="Destroying..."
															triggerVariant="ghost"
															triggerSize="xs"
															disabled={stack.isProtected}
															hiddenFields={{ stackId: stack.stackId || "" }}
															triggerClassName="h-7 w-7 p-0 text-muted hover:text-danger"
															triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
														/>
														<LinkButton
															href={`/dashboard/stacks/${stack.stackId}${detailEnvironmentSuffix}`}
															variant="ghost"
															size="icon-xs"
															title="Open"
														>
															<ExternalLink className="h-3.5 w-3.5" />
														</LinkButton>
													</>
												) : includeUntracked ? (
													<>
														{isRunningStack(stack.status, stack.runningCount) ? (
															<>
																<form action={controlComposeProjectAction}>
																	<input type="hidden" name="projectName" value={stack.slug} />
																	<input type="hidden" name="action" value="stop" />
																	{stack.configFiles.map((configFile) => (
																		<input
																			key={`stop-${configFile}`}
																			type="hidden"
																			name="configFiles"
																			value={configFile}
																		/>
																	))}
																	<FormSubmitButton
																		label=""
																		pendingLabel=""
																		variant="ghost"
																		size="xs"
																		disabled={stack.isProtected}
																		title="Stop"
																		className="h-7 w-7 p-0"
																	>
																		<Square className="h-3.5 w-3.5" />
																	</FormSubmitButton>
																</form>
																<form action={controlComposeProjectAction}>
																	<input type="hidden" name="projectName" value={stack.slug} />
																	<input type="hidden" name="action" value="restart" />
																	{stack.configFiles.map((configFile) => (
																		<input
																			key={`restart-${configFile}`}
																			type="hidden"
																			name="configFiles"
																			value={configFile}
																		/>
																	))}
																	<FormSubmitButton
																		label=""
																		pendingLabel=""
																		variant="ghost"
																		size="xs"
																		disabled={stack.isProtected}
																		title="Restart"
																		className="h-7 w-7 p-0"
																	>
																		<RefreshCw className="h-3.5 w-3.5" />
																	</FormSubmitButton>
																</form>
															</>
														) : (
															<form action={controlComposeProjectAction}>
																<input type="hidden" name="projectName" value={stack.slug} />
																<input type="hidden" name="action" value="start" />
																{stack.configFiles.map((configFile) => (
																	<input
																		key={`start-${configFile}`}
																		type="hidden"
																		name="configFiles"
																		value={configFile}
																	/>
																))}
																<FormSubmitButton
																	label=""
																	pendingLabel=""
																	variant="ghost"
																	size="xs"
																	disabled={stack.isProtected}
																	title="Start"
																	className="h-7 w-7 p-0"
																>
																	<Play className="h-3.5 w-3.5" />
																</FormSubmitButton>
															</form>
														)}
														<DestructiveActionModal
															action={controlComposeProjectAction}
															title={`Destroy compose stack ${stack.slug}`}
															description="This will run docker compose down for the selected stack."
															triggerLabel=""
															confirmLabel="Destroy"
															pendingLabel="Destroying..."
															triggerVariant="ghost"
															triggerSize="xs"
															disabled={stack.isProtected}
															hiddenFields={{
																projectName: stack.slug,
																action: "destroy",
																configFiles: stack.configFiles,
															}}
															triggerClassName="h-7 w-7 p-0 text-muted hover:text-danger"
															triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
															options={[
																{
																	name: "removeVolumes",
																	label: "Remove attached volumes",
																	description: "Persistent data may be lost.",
																},
																{
																	name: "removeImages",
																	label: "Remove local compose images",
																	description: "Images will be pulled again on next start.",
																},
															]}
														/>
													</>
												) : null}
												{stack.type === "untracked" && includeUntracked ? (
													<form action={adoptComposeProjectAction}>
														<input type="hidden" name="projectName" value={stack.slug} />
														{stack.configFiles.map((configFile) => (
															<input
																key={`adopt-${configFile}`}
																type="hidden"
																name="configFiles"
																value={configFile}
															/>
														))}
														<FormSubmitButton
															label=""
															pendingLabel=""
															size="xs"
															variant="ghost"
															disabled={stack.isProtected}
															title="Adopt"
															className="h-7 w-7 p-0"
														>
															<Upload className="h-3.5 w-3.5" />
														</FormSubmitButton>
													</form>
												) : null}
											</div>
										</DataTableCell>
									</DataTableRow>
									{expanded ? (
										<DataTableRow>
											<DataTableCell colSpan={8}>
												<div className="rounded-lg border border-default/8 bg-background/60 p-3">
													<div className="mb-2 flex items-center justify-between">
														<p className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">
															Services
														</p>
														<p className="text-xs text-muted">
															{stack.containers.length} container(s)
														</p>
													</div>
													{stack.containers.length ? (
														<div className="grid gap-1.5 lg:grid-cols-2 2xl:grid-cols-3">
															{stack.containers.map((container) => (
																<div
																	key={`${rowKey}-${container.ID}`}
																	className="flex items-center justify-between rounded-md border border-default/8 bg-surface px-3 py-2"
																>
																	<div className="min-w-0 flex-1">
																		<div className="flex items-center gap-2">
																			<p className="truncate text-sm font-medium">
																				{getContainerName(container)}
																			</p>
																			<StatusBadge status={getContainerState(container)} />
																		</div>
																		<p className="truncate text-[11px] text-muted">
																			{getContainerImage(container)}
																		</p>
																	</div>
																	<LinkButton
																		href={`/dashboard/containers/${container.ID}`}
																		variant="ghost"
																		size="icon-xs"
																		title="Open container"
																	>
																		<ExternalLink className="h-3 w-3" />
																	</LinkButton>
																</div>
															))}
														</div>
													) : (
														<p className="text-xs text-muted">
															No container services discovered for this stack.
														</p>
													)}
												</div>
											</DataTableCell>
										</DataTableRow>
									) : null}
								</Fragment>
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
