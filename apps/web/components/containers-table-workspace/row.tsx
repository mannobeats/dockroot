"use client";

import {
	ArrowUpCircle,
	ExternalLink,
	Lock,
	Logs as LogsIcon,
	Play,
	RefreshCw,
	Square,
	SquareTerminal,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import type {
	ColumnId,
	ContainerRow,
	ContainerStats,
	FormAction,
	UpdatePolicyRecord,
	UpdateStateRecord,
} from "@/components/containers-table-workspace/types";
import {
	CpuBar,
	extractUptime,
	getStatsForContainer,
	latestRefForMajorUpgrade,
	MemoryBar,
	summarizeComposeProject,
	tagFromImageRef,
} from "@/components/containers-table-workspace/utils";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { DataTableCell, DataTableRow } from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/link-button";
import { PopoverCard } from "@/components/ui/popover-card";

type ContainersTableRowProps = {
	container: ContainerRow;
	environmentId: string;
	managerUrl?: string;
	isVisible: (columnId: ColumnId) => boolean;
	isProtected: boolean;
	protectedLabel?: string;
	isSelected: boolean;
	onSelectChange: (checked: boolean) => void;
	controlContainerAction: FormAction;
	checkContainerUpdatesAction: FormAction;
	applyContainerUpdatesAction: FormAction;
	setContainerUpdatePolicyAction: FormAction;
	updatePolicyMap: UpdatePolicyRecord;
	updateStateMap: UpdateStateRecord;
	containerStats: Record<string, ContainerStats>;
};

export function ContainersTableRow({
	container,
	environmentId,
	managerUrl,
	isVisible,
	isProtected,
	protectedLabel,
	isSelected,
	onSelectChange,
	controlContainerAction,
	checkContainerUpdatesAction,
	applyContainerUpdatesAction,
	setContainerUpdatePolicyAction,
	updatePolicyMap,
	updateStateMap,
	containerStats,
}: ContainersTableRowProps) {
	const state = (container.State || "").toLowerCase();
	const isRunning = state === "running";
	const composeProject = summarizeComposeProject(container.Labels);
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
	const { stats, cpuPercent, memory } = getStatsForContainer(containerName, containerStats);
	const uptime = isRunning ? extractUptime(container.Status || "") : "—";

	return (
		<DataTableRow>
			<DataTableCell>
				<input
					type="checkbox"
					aria-label={`Select ${container.Names}`}
					disabled={isProtected}
					checked={isSelected}
					onChange={(event) => onSelectChange(event.target.checked)}
					className="h-3.5 w-3.5 rounded border-default/30 bg-background"
				/>
			</DataTableCell>

			{isVisible("name") ? (
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
					{composeProject ? <p className="text-[11px] text-muted">{composeProject}</p> : null}
				</DataTableCell>
			) : null}

			{isVisible("image") ? (
				<DataTableCell className="max-w-[180px] truncate text-xs text-muted">
					{container.Image}
				</DataTableCell>
			) : null}

			{isVisible("state") ? (
				<DataTableCell>
					<div className="space-y-0.5">
						<StatusBadge status={state || "offline"} />
						{container.HealthStatus ? <StatusBadge status={container.HealthStatus} /> : null}
					</div>
				</DataTableCell>
			) : null}

			{isVisible("cpu") ? (
				<DataTableCell>
					{isRunning ? (
						<CpuBar percent={cpuPercent} />
					) : (
						<span className="text-xs text-muted/50">—</span>
					)}
				</DataTableCell>
			) : null}

			{isVisible("memory") ? (
				<DataTableCell>
					{isRunning ? (
						<MemoryBar usage={memory.usage} percent={memory.percent} />
					) : (
						<span className="text-xs text-muted/50">—</span>
					)}
				</DataTableCell>
			) : null}

			{isVisible("uptime") ? (
				<DataTableCell className="text-xs text-muted whitespace-nowrap">{uptime}</DataTableCell>
			) : null}

			{isVisible("netio") ? (
				<DataTableCell className="text-xs text-muted whitespace-nowrap font-mono">
					{isRunning && stats.NetIO ? stats.NetIO : "—"}
				</DataTableCell>
			) : null}

			{isVisible("ports") ? (
				<DataTableCell>
					<RuntimePortLinks ports={container.Ports} compact managerUrl={managerUrl} />
				</DataTableCell>
			) : null}

			{isVisible("stack") ? (
				<DataTableCell className="text-xs text-muted">{composeProject || "—"}</DataTableCell>
			) : null}

			{isVisible("updates") ? (
				<DataTableCell>
					<div className="space-y-1 text-[11px]">
						<div className="flex items-center gap-1">
							<form action={setContainerUpdatePolicyAction}>
								<input type="hidden" name="environmentId" value={environmentId} />
								<input type="hidden" name="containerName" value={containerName} />
								<input type="hidden" name="mode" value="check" />
								<input type="hidden" name="enabled" value={checkEnabled ? "false" : "true"} />
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
								<input type="hidden" name="enabled" value={updateEnabled ? "false" : "true"} />
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
											Target:{" "}
											<span className="font-mono text-foreground">
												{majorTargetImageRef || "latest"}
											</span>{" "}
											({majorTargetTag})
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
			) : null}

			{isVisible("actions") ? (
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
			) : null}
		</DataTableRow>
	);
}
