"use client";

import {
	ArrowUpCircle,
	ExternalLink,
	Logs as LogsIcon,
	Play,
	RefreshCw,
	Square,
	SquareTerminal,
	Trash2,
} from "lucide-react";
import type { ContainerRow, FormAction } from "@/components/containers-table-workspace/types";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { DataTableCell } from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/link-button";

export function ContainersActionsCell({
	container,
	environmentId,
	isProtected,
	isRunning,
	updateAvailable,
	controlContainerAction,
	checkContainerUpdatesAction,
	applyContainerUpdatesAction,
}: {
	container: ContainerRow;
	environmentId: string;
	isProtected: boolean;
	isRunning: boolean;
	updateAvailable: boolean;
	controlContainerAction: FormAction;
	checkContainerUpdatesAction: FormAction;
	applyContainerUpdatesAction: FormAction;
}) {
	return (
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
							triggerTitle="Remove"
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
					title="View"
				>
					<ExternalLink className="h-3.5 w-3.5" />
				</LinkButton>
			</div>
		</DataTableCell>
	);
}
