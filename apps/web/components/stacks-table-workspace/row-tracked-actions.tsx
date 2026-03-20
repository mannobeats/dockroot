import { ExternalLink, Play, RotateCcw, Trash2 } from "lucide-react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { FormAction, StackRow } from "@/components/stacks-table-workspace/types";
import { isRunningStack } from "@/components/stacks-table-workspace/utils";
import { LinkButton } from "@/components/ui/link-button";

export function TrackedStackActions({
	stack,
	detailEnvironmentSuffix,
	onWatchStack,
	deployStackAction,
	destroyStackAction,
}: {
	stack: Extract<StackRow, { type: "tracked" }>;
	detailEnvironmentSuffix: string;
	onWatchStack: (stackId: string) => void;
	deployStackAction: FormAction;
	destroyStackAction: FormAction;
}) {
	const running = isRunningStack(stack.status, stack.runningCount);

	return (
		<>
			<form
				action={deployStackAction}
				onSubmit={() => {
					onWatchStack(stack.stackId);
				}}
			>
				<input type="hidden" name="stackId" value={stack.stackId} />
				<FormSubmitButton
					label=""
					pendingLabel=""
					size="xs"
					variant="ghost"
					disabled={stack.isProtected}
					title={running ? "Redeploy" : "Deploy"}
					className="h-7 w-7 p-0"
				>
					{running ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
				</FormSubmitButton>
			</form>
			<DestructiveActionModal
				action={destroyStackAction}
				onConfirm={() => {
					onWatchStack(stack.stackId);
				}}
				title={`Remove stack ${stack.name}`}
				description="This will stop and remove the stack resources."
				triggerLabel=""
				confirmLabel="Remove"
				pendingLabel="Removing..."
				triggerVariant="ghost"
				triggerSize="xs"
				disabled={stack.isProtected}
				hiddenFields={{ stackId: stack.stackId }}
				triggerClassName="h-7 w-7 p-0 text-muted hover:text-danger"
				triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
				triggerTitle="Remove"
			/>
			<LinkButton
				href={`/dashboard/stacks/${stack.stackId}${detailEnvironmentSuffix}`}
				variant="ghost"
				size="icon-xs"
				title="View"
			>
				<ExternalLink className="h-3.5 w-3.5" />
			</LinkButton>
		</>
	);
}
