"use client";

import {
	ChevronDown,
	ChevronRight,
	ExternalLink,
	Lock,
	PanelRightClose,
	PanelRightOpen,
	Play,
	RefreshCw,
	RotateCcw,
	Square,
	TerminalSquare,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { InstantFilterToolbar } from "@/components/instant-filter-toolbar";
import { LiveStackFeed } from "@/components/live-stack-feed";
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

type FormAction = (formData: FormData) => void | Promise<void>;

type StackContainer = Record<string, string>;

type TrackedStackRow = {
	type: "tracked";
	slug: string;
	name: string;
	status: string;
	stackId: string;
	environmentName: string;
	sourceType: string;
	containerCount: number;
	runningCount: number;
	containers: StackContainer[];
	lastDeployment: { id: string; status: string; log?: string | null } | null;
	isProtected: boolean;
};

type UntrackedStackRow = {
	type: "untracked";
	slug: string;
	name: string;
	status: string;
	stackId: null;
	environmentName: string;
	sourceType: "external";
	containerCount: number;
	runningCount: number;
	containers: StackContainer[];
	configFiles: string[];
	lastDeployment: null;
	isProtected: boolean;
};

type StackRow = TrackedStackRow | UntrackedStackRow;

function normalizeStatus(status: string) {
	return status.split("(")[0]?.trim().toLowerCase() || "unknown";
}

function isRunningStack(status: string, runningCount: number) {
	return runningCount > 0 || normalizeStatus(status).includes("running");
}

function getContainerName(container: StackContainer) {
	return container.Names || container.Name || container.ID?.slice(0, 12) || "container";
}

function getContainerState(container: StackContainer) {
	return container.State || container.Status || "unknown";
}

function getContainerImage(container: StackContainer) {
	return container.Image || "unknown image";
}

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
}: {
	stacks: StackRow[];
	includeUntracked: boolean;
	environmentId?: string;
	initialWatchStackId?: string;
	deployStackAction: FormAction;
	destroyStackAction: FormAction;
	adoptComposeProjectAction: FormAction;
	controlComposeProjectAction: FormAction;
	bulkRestartStacksAction: FormAction;
	bulkStopStacksAction: FormAction;
	bulkDestroyStacksAction: FormAction;
	bulkRemoveStacksAction: FormAction;
}) {
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
		};

		client.on("deployment:update", onDeploymentUpdate);
		return () => {
			client.off("deployment:update", onDeploymentUpdate);
		};
	}, []);

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
			<div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-default/8 px-3 py-2">
				<p className="mr-2 text-xs text-muted">
					{selectedCount ? `${selectedCount} selected` : "Select one or more stacks"}
				</p>
				<form
					action={bulkRestartStacksAction}
					onSubmit={() => {
						setSelectedRowKeys({});
						if (selectedTracked[0]?.stackId) {
							setWatchedStackId(selectedTracked[0].stackId);
							setLogDockOpen(true);
						}
					}}
				>
					{selectedTrackedIds.map((stackId) => (
						<input
							key={`restart-tracked-${stackId}`}
							type="hidden"
							name="stackIds"
							value={stackId}
						/>
					))}
					<input type="hidden" name="projects" value={selectedUntrackedPayload} />
					<FormSubmitButton
						label={`Restart${selectedCount ? ` (${selectedCount})` : ""}`}
						pendingLabel="Restarting..."
						size="xs"
						variant="outline"
						disabled={!selectedCount}
					/>
				</form>
				<form
					action={bulkStopStacksAction}
					onSubmit={() => {
						setSelectedRowKeys({});
						if (selectedTracked[0]?.stackId) {
							setWatchedStackId(selectedTracked[0].stackId);
							setLogDockOpen(true);
						}
					}}
				>
					{selectedTrackedIds.map((stackId) => (
						<input key={`stop-tracked-${stackId}`} type="hidden" name="stackIds" value={stackId} />
					))}
					<input type="hidden" name="projects" value={selectedUntrackedPayload} />
					<FormSubmitButton
						label={`Stop${selectedCount ? ` (${selectedCount})` : ""}`}
						pendingLabel="Stopping..."
						size="xs"
						variant="outline"
						disabled={!selectedCount}
					/>
				</form>
				<DestructiveActionModal
					action={bulkDestroyStacksAction}
					onConfirm={() => {
						setSelectedRowKeys({});
						if (selectedTracked[0]?.stackId) {
							setWatchedStackId(selectedTracked[0].stackId);
							setLogDockOpen(true);
						}
					}}
					title={`Destroy ${selectedCount} stack(s)`}
					description="This stops and destroys runtime resources for the selected stacks."
					triggerLabel={`Destroy${selectedCount ? ` (${selectedCount})` : ""}`}
					confirmLabel="Destroy"
					pendingLabel="Destroying..."
					triggerVariant="danger"
					triggerSize="xs"
					disabled={!selectedCount}
					hiddenFields={{
						stackIds: selectedTrackedIds,
						projects: selectedUntrackedPayload,
					}}
				/>
				<DestructiveActionModal
					action={bulkRemoveStacksAction}
					onConfirm={() => {
						setSelectedRowKeys({});
					}}
					title={`Remove ${selectedCount} stack(s)`}
					description="Tracked stacks are removed from Dockroot. Compose stacks are fully removed with containers, volumes, and local images."
					triggerLabel={`Remove${selectedCount ? ` (${selectedCount})` : ""}`}
					confirmLabel="Remove"
					pendingLabel="Removing..."
					triggerVariant="warning"
					triggerSize="xs"
					disabled={!selectedCount}
					hiddenFields={{
						stackIds: selectedTrackedIds,
						projects: selectedUntrackedPayload,
					}}
				/>
				<button
					type="button"
					onClick={() => setSelectedRowKeys({})}
					disabled={!selectedCount}
					className="ml-auto text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
				>
					Clear
				</button>
				<button
					type="button"
					onClick={() => setLogDockOpen((open) => !open)}
					disabled={!liveTargetStack}
					className="inline-flex h-7 items-center gap-1.5 rounded-md border border-default/15 px-2.5 text-xs text-muted transition-colors hover:border-default/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
					title="Toggle live deploy console"
				>
					{logDockOpen ? (
						<PanelRightClose className="h-3.5 w-3.5" />
					) : (
						<PanelRightOpen className="h-3.5 w-3.5" />
					)}
					Console
				</button>
			</div>

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
				<div className="fixed inset-y-4 right-4 z-40 w-[min(44rem,92vw)] max-w-xl rounded-xl border border-default/12 bg-surface/95 shadow-[var(--shadow-lg)] backdrop-blur-sm">
					<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
						<div className="min-w-0">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted/75">
								Live Deploy Console
							</p>
							<p className="truncate text-sm font-medium">{liveTargetStack.name}</p>
						</div>
						<div className="flex items-center gap-1.5">
							<LinkButton
								href={`/dashboard/stacks/${liveTargetStack.stackId}${environmentId ? `?environment=${environmentId}` : ""}`}
								variant="ghost"
								size="icon-xs"
								title="Open stack workspace"
							>
								<TerminalSquare className="h-3.5 w-3.5" />
							</LinkButton>
							<button
								type="button"
								onClick={() => setLogDockOpen(false)}
								className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
								aria-label="Close deploy console"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
					<div className="p-3">
						<LiveStackFeed
							stackId={liveTargetStack.stackId}
							initialLog={liveTargetStack.lastDeployment?.log}
							height="min(72vh, 760px)"
						/>
					</div>
				</div>
			) : null}
		</Panel>
	);
}
