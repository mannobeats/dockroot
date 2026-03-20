"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { ContainersActionsCell } from "@/components/containers-table-workspace/actions-cell";
import type {
	ColumnId,
	ContainerRow,
	ContainerStats,
	FormAction,
	UpdatePolicyRecord,
	UpdateStateRecord,
} from "@/components/containers-table-workspace/types";
import { ContainersUpdatesCell } from "@/components/containers-table-workspace/updates-cell";
import {
	CpuBar,
	extractUptime,
	latestRefForMajorUpgrade,
	MemoryBar,
	summarizeComposeProject,
	tagFromImageRef,
} from "@/components/containers-table-workspace/utils";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { DataTableCell, DataTableRow } from "@/components/ui/data-table";

type ContainersTableRowProps = {
	container: ContainerRow;
	environmentId: string;
	managerUrl?: string;
	isVisible: (columnId: ColumnId) => boolean;
	isProtected: boolean;
	protectedLabel?: string;
	isSelected: boolean;
	onSelectChange: (containerId: string, checked: boolean) => void;
	controlContainerAction: FormAction;
	checkContainerUpdatesAction: FormAction;
	applyContainerUpdatesAction: FormAction;
	setContainerUpdatePolicyAction: FormAction;
	updatePolicyMap: UpdatePolicyRecord;
	updateStateMap: UpdateStateRecord;
	rowStats: ContainerStats | undefined;
};

export const ContainersTableRow = memo(function ContainersTableRow({
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
	rowStats,
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
	const stats = rowStats || {};
	const cpuPercent = Number.parseFloat((stats.CPUPerc || "0").replace("%", "")) || 0;
	const memPercent = Number.parseFloat((stats.MemPerc || "0").replace("%", "")) || 0;
	const memUsageParts = (stats.MemUsage || "").split("/");
	const memory = { usage: memUsageParts[0]?.trim() || "—", percent: memPercent };
	const uptime = isRunning ? extractUptime(container.Status || "") : "—";

	return (
		<DataTableRow>
			<DataTableCell>
				<input
					type="checkbox"
					aria-label={`Select ${container.Names}`}
					disabled={isProtected}
					checked={isSelected}
					onChange={(event) => onSelectChange(container.ID, event.target.checked)}
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
					<div className="flex flex-col items-start gap-0.5">
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
				<ContainersUpdatesCell
					containerName={containerName}
					containerImage={container.Image || ""}
					environmentId={environmentId}
					isProtected={isProtected}
					checkEnabled={checkEnabled}
					updateEnabled={updateEnabled}
					checkFailed={checkFailed}
					updateAvailable={updateAvailable}
					majorUpdateAvailable={majorUpdateAvailable}
					majorTargetImageRef={majorTargetImageRef || ""}
					majorTargetTag={majorTargetTag}
					updateErrorMessage={updateState?.lastError}
					setContainerUpdatePolicyAction={setContainerUpdatePolicyAction}
				/>
			) : null}

			{isVisible("actions") ? (
				<ContainersActionsCell
					container={container}
					environmentId={environmentId}
					isProtected={isProtected}
					isRunning={isRunning}
					updateAvailable={updateAvailable}
					controlContainerAction={controlContainerAction}
					checkContainerUpdatesAction={checkContainerUpdatesAction}
					applyContainerUpdatesAction={applyContainerUpdatesAction}
				/>
			) : null}
		</DataTableRow>
	);
});
