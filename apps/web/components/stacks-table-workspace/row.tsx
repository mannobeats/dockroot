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
import { Fragment } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { FormAction, StackRow } from "@/components/stacks-table-workspace/types";
import {
	getContainerImage,
	getContainerName,
	getContainerState,
	isRunningStack,
	normalizeStatus,
} from "@/components/stacks-table-workspace/utils";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { DataTableCell, DataTableRow } from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/link-button";
import { getProtectedStackLabel } from "@/lib/runtime-protection";

type StacksTableRowProps = {
	stack: StackRow;
	rowKey: string;
	expanded: boolean;
	isSelected: boolean;
	includeUntracked: boolean;
	environmentId?: string;
	onToggleExpanded: () => void;
	onSelectChange: (checked: boolean) => void;
	onWatchStack: (stackId: string) => void;
	deployStackAction: FormAction;
	destroyStackAction: FormAction;
	adoptComposeProjectAction: FormAction;
	controlComposeProjectAction: FormAction;
};

export function StacksTableRow({
	stack,
	rowKey,
	expanded,
	isSelected,
	includeUntracked,
	environmentId,
	onToggleExpanded,
	onSelectChange,
	onWatchStack,
	deployStackAction,
	destroyStackAction,
	adoptComposeProjectAction,
	controlComposeProjectAction,
}: StacksTableRowProps) {
	const detailEnvironmentSuffix = environmentId ? `?environment=${environmentId}` : "";
	const protectedLabel = getProtectedStackLabel(stack.slug);

	return (
		<Fragment>
			<DataTableRow className="align-top">
				<DataTableCell>
					<input
						type="checkbox"
						aria-label={`Select ${stack.name}`}
						disabled={stack.isProtected}
						checked={isSelected}
						onChange={(event) => onSelectChange(event.target.checked)}
						className="h-3.5 w-3.5 rounded border-default/30 bg-background"
					/>
				</DataTableCell>
				<DataTableCell>
					<button
						type="button"
						onClick={onToggleExpanded}
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
						status={stack.type === "tracked" ? stack.status : normalizeStatus(stack.status)}
					/>
				</DataTableCell>
				<DataTableCell className="text-xs text-muted">
					{stack.type === "tracked" ? "Internal" : "Untracked"}
				</DataTableCell>
				<DataTableCell className="text-xs text-muted">{stack.environmentName || "—"}</DataTableCell>
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
										onWatchStack(stack.stackId);
									}}
								>
									<input type="hidden" name="stackId" value={stack.stackId || ""} />
									<FormSubmitButton
										label=""
										pendingLabel=""
										size="xs"
										variant="ghost"
										disabled={stack.isProtected}
										title={isRunningStack(stack.status, stack.runningCount) ? "Redeploy" : "Deploy"}
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
										onWatchStack(stack.stackId);
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
								<p className="text-xs text-muted">{stack.containers.length} container(s)</p>
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
}
