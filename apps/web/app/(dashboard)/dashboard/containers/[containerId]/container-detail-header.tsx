import {
	ArrowLeft,
	Lock,
	Logs as LogsIcon,
	Play,
	RefreshCw,
	Square,
	SquareTerminal,
	Trash2,
} from "lucide-react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";

export function ContainerDetailHeader({
	containerId,
	containerName,
	containerState,
	image,
	environmentId,
	environmentName,
	isProtected,
	protectedLabel,
	isRunning,
	controlContainerAction,
}: {
	containerId: string;
	containerName: string;
	containerState: string;
	image?: string;
	environmentId: string;
	environmentName: string;
	isProtected: boolean;
	protectedLabel?: string;
	isRunning: boolean;
	controlContainerAction: (formData: FormData) => void | Promise<void>;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex items-center gap-2.5">
				<LinkButton
					href={`/dashboard/containers?environment=${environmentId}`}
					variant="ghost"
					size="icon-sm"
				>
					<ArrowLeft className="h-4 w-4" />
				</LinkButton>
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-lg font-semibold">{containerName}</h1>
						<StatusBadge status={containerState} />
						{isProtected ? (
							<Badge title={protectedLabel || undefined} variant="warning">
								<Lock className="h-2.5 w-2.5" />
							</Badge>
						) : null}
					</div>
					<p className="text-xs text-muted">
						{image} · {environmentName}
					</p>
				</div>
			</div>
			<div className="flex items-center gap-0.5">
				{isRunning ? (
					<>
						<form action={controlContainerAction}>
							<input type="hidden" name="containerId" value={containerId} />
							<input type="hidden" name="action" value="stop" />
							<input type="hidden" name="environmentId" value={environmentId} />
							<FormSubmitButton
								label=""
								pendingLabel=""
								disabled={isProtected}
								variant="ghost"
								size="xs"
								title="Stop"
								className="h-8 w-8 p-0"
							>
								<Square className="h-4 w-4" />
							</FormSubmitButton>
						</form>
						<form action={controlContainerAction}>
							<input type="hidden" name="containerId" value={containerId} />
							<input type="hidden" name="action" value="restart" />
							<input type="hidden" name="environmentId" value={environmentId} />
							<FormSubmitButton
								label=""
								pendingLabel=""
								disabled={isProtected}
								variant="ghost"
								size="xs"
								title="Restart"
								className="h-8 w-8 p-0"
							>
								<RefreshCw className="h-4 w-4" />
							</FormSubmitButton>
						</form>
					</>
				) : (
					<>
						<form action={controlContainerAction}>
							<input type="hidden" name="containerId" value={containerId} />
							<input type="hidden" name="action" value="start" />
							<input type="hidden" name="environmentId" value={environmentId} />
							<FormSubmitButton
								label=""
								pendingLabel=""
								disabled={isProtected}
								variant="ghost"
								size="xs"
								title="Start"
								className="h-8 w-8 p-0"
							>
								<Play className="h-4 w-4" />
							</FormSubmitButton>
						</form>
						<DestructiveActionModal
							action={controlContainerAction}
							title={`Remove container ${containerName}`}
							description="This permanently removes the container."
							triggerLabel=""
							confirmLabel="Remove"
							pendingLabel="Removing..."
							triggerVariant="ghost"
							triggerSize="xs"
							disabled={isProtected}
							triggerClassName="h-8 w-8 p-0 text-muted hover:text-danger"
							triggerIcon={<Trash2 className="h-4 w-4" />}
							hiddenFields={{
								containerId,
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
					</>
				)}
				<LinkButton
					href={`/dashboard/shell?target=container&containerId=${containerId}&environment=${environmentId}`}
					variant="ghost"
					size="icon-sm"
					title="Shell"
				>
					<SquareTerminal className="h-4 w-4" />
				</LinkButton>
				<LinkButton
					href={`/dashboard/logs?mode=single&container=${containerId}&environment=${environmentId}`}
					variant="ghost"
					size="icon-sm"
					title="Logs"
				>
					<LogsIcon className="h-4 w-4" />
				</LinkButton>
			</div>
		</div>
	);
}
