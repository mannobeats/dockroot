import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { FormAction } from "@/components/stacks-table-workspace/types";

export function StacksBulkActions({
	selectedCount,
	selectedTrackedIds,
	selectedUntrackedPayload,
	firstTrackedId,
	bulkRestartStacksAction,
	bulkStopStacksAction,
	bulkDestroyStacksAction,
	bulkRemoveStacksAction,
	onAfterRuntimeAction,
	onAfterRemoveAction,
	onClearSelection,
	liveTargetAvailable,
	logDockOpen,
	onToggleLogDock,
}: {
	selectedCount: number;
	selectedTrackedIds: string[];
	selectedUntrackedPayload: string;
	firstTrackedId?: string;
	bulkRestartStacksAction: FormAction;
	bulkStopStacksAction: FormAction;
	bulkDestroyStacksAction: FormAction;
	bulkRemoveStacksAction: FormAction;
	onAfterRuntimeAction: (stackId?: string) => void;
	onAfterRemoveAction: () => void;
	onClearSelection: () => void;
	liveTargetAvailable: boolean;
	logDockOpen: boolean;
	onToggleLogDock: () => void;
}) {
	return (
		<div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-default/8 px-3 py-2">
			<p className="mr-2 text-xs text-muted">
				{selectedCount ? `${selectedCount} selected` : "Select one or more stacks"}
			</p>
			<form action={bulkRestartStacksAction} onSubmit={() => onAfterRuntimeAction(firstTrackedId)}>
				{selectedTrackedIds.map((stackId) => (
					<input key={`restart-tracked-${stackId}`} type="hidden" name="stackIds" value={stackId} />
				))}
				<input type="hidden" name="projects" value={selectedUntrackedPayload} />
				<FormSubmitButton
					label="Restart"
					pendingLabel="Restarting..."
					size="xs"
					variant="outline"
					disabled={!selectedCount}
				/>
			</form>
			<form action={bulkStopStacksAction} onSubmit={() => onAfterRuntimeAction(firstTrackedId)}>
				{selectedTrackedIds.map((stackId) => (
					<input key={`stop-tracked-${stackId}`} type="hidden" name="stackIds" value={stackId} />
				))}
				<input type="hidden" name="projects" value={selectedUntrackedPayload} />
				<FormSubmitButton
					label="Stop"
					pendingLabel="Stopping..."
					size="xs"
					variant="outline"
					disabled={!selectedCount}
				/>
			</form>
			<DestructiveActionModal
				action={bulkDestroyStacksAction}
				onConfirm={() => onAfterRuntimeAction(firstTrackedId)}
				title={`Destroy ${selectedCount} stack(s)`}
				description="This stops and destroys runtime resources for the selected stacks."
				triggerLabel="Destroy"
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
				onConfirm={onAfterRemoveAction}
				title={`Remove ${selectedCount} stack(s)`}
				description="Tracked stacks are removed from Dockroot. Compose stacks are fully removed with containers, volumes, and local images."
				triggerLabel="Remove"
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
				onClick={onClearSelection}
				disabled={!selectedCount}
				className="ml-auto text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
			>
				Clear
			</button>
			<button
				type="button"
				onClick={onToggleLogDock}
				disabled={!liveTargetAvailable}
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
	);
}
