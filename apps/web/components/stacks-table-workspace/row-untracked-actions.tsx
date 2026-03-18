import { Play, RefreshCw, Square, Trash2, Upload } from "lucide-react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { FormAction, StackRow } from "@/components/stacks-table-workspace/types";
import { isRunningStack } from "@/components/stacks-table-workspace/utils";
import { StackRowConfigFileFields } from "./row-hidden-config-fields";

export function UntrackedComposeActions({
	stack,
	controlComposeProjectAction,
}: {
	stack: Extract<StackRow, { type: "untracked" }>;
	controlComposeProjectAction: FormAction;
}) {
	const running = isRunningStack(stack.status, stack.runningCount);

	return (
		<>
			{running ? (
				<>
					<form action={controlComposeProjectAction}>
						<input type="hidden" name="projectName" value={stack.slug} />
						<input type="hidden" name="action" value="stop" />
						<StackRowConfigFileFields configFiles={stack.configFiles} actionName="stop" />
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
						<StackRowConfigFileFields configFiles={stack.configFiles} actionName="restart" />
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
					<StackRowConfigFileFields configFiles={stack.configFiles} actionName="start" />
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
	);
}

export function AdoptUntrackedStackAction({
	stack,
	adoptComposeProjectAction,
}: {
	stack: Extract<StackRow, { type: "untracked" }>;
	adoptComposeProjectAction: FormAction;
}) {
	return (
		<form action={adoptComposeProjectAction}>
			<input type="hidden" name="projectName" value={stack.slug} />
			<StackRowConfigFileFields configFiles={stack.configFiles} actionName="adopt" />
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
	);
}
