"use client";

import {
	ArrowUpCircle,
	ExternalLink,
	Lock,
	Logs as LogsIcon,
	PanelRightClose,
	PanelRightOpen,
	Play,
	RefreshCw,
	Square,
	SquareTerminal,
	TerminalSquare,
	Trash2,
	X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveStackFeed } from "@/components/live-stack-feed";
import { RuntimePortLinks } from "@/components/runtime-port-links";
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
import { PopoverCard } from "@/components/ui/popover-card";
import { getSocket } from "@/lib/socket-client";

type FormAction = (formData: FormData) => void | Promise<void>;

type ContainerRow = Record<string, string>;

function summarizeComposeProject(labels: string | undefined) {
	if (!labels) {
		return "";
	}
	return (
		labels
			.split(",")
			.find((entry) => entry.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=") || ""
	);
}

function latestRefForMajorUpgrade(imageRef: string) {
	const value = (imageRef || "").trim();
	if (!value || value.includes("@")) {
		return null;
	}
	const lastSlash = value.lastIndexOf("/");
	const lastColon = value.lastIndexOf(":");
	if (lastColon <= lastSlash) {
		return null;
	}
	const repository = value.slice(0, lastColon);
	const tag = value.slice(lastColon + 1);
	if (!repository || !tag || tag === "latest") {
		return null;
	}
	return `${repository}:latest`;
}

function tagFromImageRef(imageRef: string) {
	const value = (imageRef || "").trim();
	if (!value || value.includes("@")) {
		return null;
	}
	const lastSlash = value.lastIndexOf("/");
	const lastColon = value.lastIndexOf(":");
	if (lastColon <= lastSlash) {
		return null;
	}
	return value.slice(lastColon + 1);
}

export function ContainersTableWorkspace({
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
	protectedContainerIds,
	protectedContainerLabels,
	initialWatchStackId,
	updatePolicyMap,
	updateStateMap,
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
	protectedContainerIds: string[];
	protectedContainerLabels: Record<string, string>;
	initialWatchStackId?: string;
	updatePolicyMap: Record<
		string,
		{
			checkEnabled: boolean;
			updateEnabled: boolean;
		}
	>;
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
}) {
	const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
	const [watchStackId, setWatchStackId] = useState(initialWatchStackId || "");
	const [logDockOpen, setLogDockOpen] = useState(Boolean(initialWatchStackId));
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

	useEffect(() => {
		const client = getSocket();
		const onDeploymentUpdate = (event: { stackId?: string; status?: string }) => {
			if (!event?.stackId) {
				return;
			}
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

	return (
		<>
			<div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-default/8 px-3 py-2">
				<p className="mr-2 text-xs text-muted">
					{selectedContainers.length
						? `${selectedContainers.length} selected`
						: "Select one or more containers"}
				</p>
				<form
					action={bulkCheckContainerUpdatesAction}
					onSubmit={() => {
						setSelectedIds({});
					}}
				>
					{selectedContainers.map((container) => (
						<input
							key={`check-${container.ID}`}
							type="hidden"
							name="containerIds"
							value={container.ID}
						/>
					))}
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label={`Check updates${selectedContainers.length ? ` (${selectedContainers.length})` : ""}`}
						pendingLabel="Checking..."
						size="xs"
						variant="outline"
						disabled={!selectedContainers.length}
					/>
				</form>
				<form
					action={bulkApplyContainerUpdatesAction}
					onSubmit={() => {
						setSelectedIds({});
					}}
				>
					{selectedContainers.map((container) => (
						<input
							key={`apply-${container.ID}`}
							type="hidden"
							name="containerIds"
							value={container.ID}
						/>
					))}
					<input type="hidden" name="environmentId" value={environmentId} />
					<input type="hidden" name="updateOnlyRunning" value="true" />
					<FormSubmitButton
						label={`Update${selectedContainers.length ? ` (${selectedContainers.length})` : ""}`}
						pendingLabel="Queueing..."
						size="xs"
						variant="secondary"
						disabled={!selectedContainers.length}
					/>
				</form>
				<form
					action={bulkControlContainerAction}
					onSubmit={() => {
						setSelectedIds({});
					}}
				>
					{selectedStopped.map((container) => (
						<input
							key={`start-${container.ID}`}
							type="hidden"
							name="containerIds"
							value={container.ID}
						/>
					))}
					<input type="hidden" name="action" value="start" />
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label={`Start${selectedStopped.length ? ` (${selectedStopped.length})` : ""}`}
						pendingLabel="Starting..."
						size="xs"
						variant="outline"
						disabled={!selectedStopped.length}
					/>
				</form>
				<form
					action={bulkControlContainerAction}
					onSubmit={() => {
						setSelectedIds({});
					}}
				>
					{selectedRunning.map((container) => (
						<input
							key={`stop-${container.ID}`}
							type="hidden"
							name="containerIds"
							value={container.ID}
						/>
					))}
					<input type="hidden" name="action" value="stop" />
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label={`Stop${selectedRunning.length ? ` (${selectedRunning.length})` : ""}`}
						pendingLabel="Stopping..."
						size="xs"
						variant="outline"
						disabled={!selectedRunning.length}
					/>
				</form>
				<form
					action={bulkControlContainerAction}
					onSubmit={() => {
						setSelectedIds({});
					}}
				>
					{selectedRunning.map((container) => (
						<input
							key={`restart-${container.ID}`}
							type="hidden"
							name="containerIds"
							value={container.ID}
						/>
					))}
					<input type="hidden" name="action" value="restart" />
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label={`Restart${selectedRunning.length ? ` (${selectedRunning.length})` : ""}`}
						pendingLabel="Restarting..."
						size="xs"
						variant="outline"
						disabled={!selectedRunning.length}
					/>
				</form>
				<DestructiveActionModal
					action={bulkControlContainerAction}
					onConfirm={() => {
						setSelectedIds({});
					}}
					title={`Remove ${selectedContainers.length} container(s)`}
					description="This permanently removes all selected containers."
					triggerLabel={`Remove${selectedContainers.length ? ` (${selectedContainers.length})` : ""}`}
					confirmLabel="Remove all"
					pendingLabel="Removing..."
					triggerVariant="danger"
					triggerSize="xs"
					disabled={!selectedContainers.length}
					hiddenFields={{
						containerIds: selectedPayload,
						action: "remove",
						environmentId,
					}}
					options={[
						{
							name: "removeVolumes",
							label: "Remove anonymous volumes",
							description: "Data in attached anonymous volumes will be lost.",
						},
					]}
				/>
				<button
					type="button"
					onClick={() => setSelectedIds({})}
					disabled={!selectedContainers.length}
					className="ml-auto text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
				>
					Clear
				</button>
				<button
					type="button"
					onClick={() => setLogDockOpen((open) => !open)}
					disabled={!watchStackId}
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
						<DataTableHead>Name</DataTableHead>
						<DataTableHead>Image</DataTableHead>
						<DataTableHead>State</DataTableHead>
						<DataTableHead>Status</DataTableHead>
						<DataTableHead>Updates</DataTableHead>
						<DataTableHead>Ports</DataTableHead>
						<DataTableHead className="w-24 text-right">Actions</DataTableHead>
					</tr>
				</DataTableHeader>
				<DataTableBody>
					{containers.length ? (
						containers.map((container) => {
							const state = (container.State || "").toLowerCase();
							const isRunning = state === "running";
							const composeProject = summarizeComposeProject(container.Labels);
							const isProtected = protectedSet.has(container.ID);
							const protectedLabel = protectedContainerLabels[container.ID] || "";
							const containerName = container.Names || container.Name || "";
							const updatePolicy = updatePolicyMap[containerName];
							const updateState = updateStateMap[containerName];
							const checkEnabled = updatePolicy?.checkEnabled ?? true;
							const updateEnabled = updatePolicy?.updateEnabled ?? false;
							const updateAvailable = Boolean(updateState?.updateAvailable);
							const majorUpdateAvailable = Boolean(updateState?.majorUpdateAvailable);
							const checkFailed = !isProtected && updateState?.lastResult === "check_failed";
							const majorTargetImageRef =
								(updateState?.majorTargetImageRef || "").trim() ||
								latestRefForMajorUpgrade(container.Image || "");
							const majorTargetTag =
								(updateState?.majorTargetTag || "").trim() ||
								tagFromImageRef(majorTargetImageRef || "") ||
								"latest";

							return (
								<DataTableRow key={`${container.ID}-${container.Names}`}>
									<DataTableCell>
										<input
											type="checkbox"
											aria-label={`Select ${container.Names}`}
											disabled={isProtected}
											checked={Boolean(selectedIds[container.ID])}
											onChange={(event) =>
												setSelectedIds((current) => ({
													...current,
													[container.ID]: event.target.checked,
												}))
											}
											className="h-3.5 w-3.5 rounded border-default/30 bg-background"
										/>
									</DataTableCell>
									<DataTableCell>
										<div className="flex items-center gap-1.5">
											<Link
												href={`/dashboard/containers/${container.ID}?environment=${environmentId}`}
												className="font-medium transition-colors hover:text-accent"
											>
												{container.Names}
											</Link>
											{isProtected ? (
												<Badge title={protectedLabel || undefined} variant="warning">
													<Lock className="h-2.5 w-2.5" />
												</Badge>
											) : null}
										</div>
										{composeProject ? (
											<p className="text-[11px] text-muted">{composeProject}</p>
										) : null}
									</DataTableCell>
									<DataTableCell className="max-w-[180px] truncate text-xs text-muted">
										{container.Image}
									</DataTableCell>
									<DataTableCell>
										<div className="space-y-0.5">
											<StatusBadge status={state || "offline"} />
											{container.HealthStatus ? (
												<StatusBadge status={container.HealthStatus} />
											) : null}
										</div>
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{container.Status || "—"}
									</DataTableCell>
									<DataTableCell>
										<div className="space-y-1 text-[11px]">
											<div className="flex items-center gap-1">
												<form action={setContainerUpdatePolicyAction}>
													<input type="hidden" name="environmentId" value={environmentId} />
													<input type="hidden" name="containerName" value={containerName} />
													<input type="hidden" name="mode" value="check" />
													<input
														type="hidden"
														name="enabled"
														value={checkEnabled ? "false" : "true"}
													/>
													<FormSubmitButton
														label={checkEnabled ? "Check off" : "Check on"}
														pendingLabel="..."
														size="xs"
														variant="ghost"
														className="h-6 px-2"
														disabled={isProtected}
													/>
												</form>
												<form action={setContainerUpdatePolicyAction}>
													<input type="hidden" name="environmentId" value={environmentId} />
													<input type="hidden" name="containerName" value={containerName} />
													<input type="hidden" name="mode" value="update" />
													<input
														type="hidden"
														name="enabled"
														value={updateEnabled ? "false" : "true"}
													/>
													<FormSubmitButton
														label={updateEnabled ? "Auto off" : "Auto on"}
														pendingLabel="..."
														size="xs"
														variant="ghost"
														className="h-6 px-2"
														disabled={isProtected}
													/>
												</form>
											</div>
											<div className="flex items-center gap-1">
												{checkFailed ? (
													<PopoverCard
														trigger={
															<Badge variant="danger" className="text-[10px]">
																Check failed
															</Badge>
														}
													>
														<div className="space-y-2 text-[11px]">
															<p className="font-medium text-danger">Update check failed</p>
															<p className="text-muted">
																{updateState?.lastError || "Unable to inspect latest image state."}
															</p>
															<p className="text-muted">
																Re-run check, or enable pull-before-check to refresh registry data.
															</p>
														</div>
													</PopoverCard>
												) : updateAvailable ? (
													<Badge variant="warning" className="text-[10px]">
														Patch/minor available
													</Badge>
												) : majorUpdateAvailable ? (
													<PopoverCard
														trigger={
															<Badge variant="warning" className="text-[10px]">
																Major available
															</Badge>
														}
													>
														<div className="space-y-2 text-[11px]">
															<p className="font-medium text-warning">Major upgrade available</p>
															<p className="text-muted">
																Current:{" "}
																<span className="font-mono text-foreground">
																	{container.Image || "unknown"}
																</span>
															</p>
															<p className="text-muted">
																Recommended:{" "}
																<span className="font-mono text-foreground">
																	{majorTargetImageRef || "latest tag"}
																</span>
															</p>
															<p className="text-muted">
																Available version:{" "}
																<span className="font-mono text-foreground">{majorTargetTag}</span>
															</p>
															<p className="text-muted">
																Major upgrades can require manual migration steps. Review the stack
																config before applying.
															</p>
															<p className="text-muted">
																Use stack editor/deploy flow for major version changes.
															</p>
														</div>
													</PopoverCard>
												) : (
													<Badge variant="default" className="text-[10px]">
														Up to date
													</Badge>
												)}
											</div>
										</div>
									</DataTableCell>
									<DataTableCell>
										<RuntimePortLinks ports={container.Ports} compact managerUrl={managerUrl} />
									</DataTableCell>
									<DataTableCell>
										<div className="flex items-center justify-end gap-0.5">
											<form action={checkContainerUpdatesAction}>
												<input type="hidden" name="containerId" value={container.ID} />
												<input type="hidden" name="environmentId" value={environmentId} />
												<FormSubmitButton
													label=""
													pendingLabel=""
													disabled={isProtected}
													variant="ghost"
													size="xs"
													title="Check updates"
													className="h-7 w-7 p-0"
												>
													<RefreshCw className="h-3.5 w-3.5" />
												</FormSubmitButton>
											</form>
											<form action={applyContainerUpdatesAction}>
												<input type="hidden" name="containerId" value={container.ID} />
												<input type="hidden" name="environmentId" value={environmentId} />
												<input type="hidden" name="updateOnlyRunning" value="true" />
												<FormSubmitButton
													label=""
													pendingLabel=""
													disabled={isProtected || !updateAvailable}
													variant="ghost"
													size="xs"
													title="Queue update"
													className="h-7 w-7 p-0"
												>
													<ArrowUpCircle className="h-3.5 w-3.5" />
												</FormSubmitButton>
											</form>
											{isRunning ? (
												<>
													<form action={controlContainerAction}>
														<input type="hidden" name="containerId" value={container.ID} />
														<input type="hidden" name="action" value="stop" />
														<input type="hidden" name="environmentId" value={environmentId} />
														<FormSubmitButton
															label=""
															pendingLabel=""
															disabled={isProtected}
															variant="ghost"
															size="xs"
															title="Stop"
															className="h-7 w-7 p-0"
														>
															<Square className="h-3.5 w-3.5" />
														</FormSubmitButton>
													</form>
													<form action={controlContainerAction}>
														<input type="hidden" name="containerId" value={container.ID} />
														<input type="hidden" name="action" value="restart" />
														<input type="hidden" name="environmentId" value={environmentId} />
														<FormSubmitButton
															label=""
															pendingLabel=""
															disabled={isProtected}
															variant="ghost"
															size="xs"
															title="Restart"
															className="h-7 w-7 p-0"
														>
															<RefreshCw className="h-3.5 w-3.5" />
														</FormSubmitButton>
													</form>
												</>
											) : (
												<>
													<form action={controlContainerAction}>
														<input type="hidden" name="containerId" value={container.ID} />
														<input type="hidden" name="action" value="start" />
														<input type="hidden" name="environmentId" value={environmentId} />
														<FormSubmitButton
															label=""
															pendingLabel=""
															disabled={isProtected}
															variant="ghost"
															size="xs"
															title="Start"
															className="h-7 w-7 p-0"
														>
															<Play className="h-3.5 w-3.5" />
														</FormSubmitButton>
													</form>
													<DestructiveActionModal
														action={controlContainerAction}
														title={`Remove container ${container.Names}`}
														description="This permanently removes the container."
														triggerLabel=""
														confirmLabel="Remove"
														pendingLabel="Removing..."
														triggerVariant="ghost"
														triggerSize="xs"
														disabled={isProtected}
														hiddenFields={{
															containerId: container.ID,
															action: "remove",
															environmentId,
														}}
														triggerClassName="h-7 w-7 p-0 text-muted hover:text-danger"
														triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
														options={[
															{
																name: "removeVolumes",
																label: "Remove anonymous volumes",
																description: "Data in attached anonymous volumes will be lost.",
															},
														]}
													/>
												</>
											)}
											<LinkButton
												href={`/dashboard/shell?target=container&containerId=${container.ID}&environment=${environmentId}`}
												variant="ghost"
												size="icon-xs"
												title="Shell"
											>
												<SquareTerminal className="h-3.5 w-3.5" />
											</LinkButton>
											<LinkButton
												href={`/dashboard/logs?mode=single&container=${container.ID}&environment=${environmentId}`}
												variant="ghost"
												size="icon-xs"
												title="Logs"
											>
												<LogsIcon className="h-3.5 w-3.5" />
											</LinkButton>
											<LinkButton
												href={`/dashboard/containers/${container.ID}?environment=${environmentId}`}
												variant="ghost"
												size="icon-xs"
												title="Details"
											>
												<ExternalLink className="h-3.5 w-3.5" />
											</LinkButton>
										</div>
									</DataTableCell>
								</DataTableRow>
							);
						})
					) : (
						<DataTableEmpty colSpan={8}>No containers matched the current filters.</DataTableEmpty>
					)}
				</DataTableBody>
			</DataTable>

			{logDockOpen && watchStackId ? (
				<div className="fixed inset-y-4 right-4 z-40 w-[min(44rem,92vw)] max-w-xl rounded-xl border border-default/12 bg-surface/95 shadow-[var(--shadow-lg)] backdrop-blur-sm">
					<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
						<div className="min-w-0">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted/75">
								Live Deploy Console
							</p>
							<p className="truncate text-sm font-medium">Queued stack: {watchStackId}</p>
						</div>
						<div className="flex items-center gap-1.5">
							<LinkButton
								href={`/dashboard/stacks?environment=${environmentId}&watchStackId=${watchStackId}`}
								variant="ghost"
								size="icon-xs"
								title="Open stacks workspace"
							>
								<TerminalSquare className="h-3.5 w-3.5" />
							</LinkButton>
							<button
								type="button"
								onClick={() => {
									setLogDockOpen(false);
									setWatchStackId("");
								}}
								className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
								aria-label="Close deploy console"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
					<div className="p-3">
						<LiveStackFeed stackId={watchStackId} height="min(72vh, 760px)" />
					</div>
				</div>
			) : null}
		</>
	);
}
