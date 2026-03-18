import { ExternalLink, Play, RefreshCw, RotateCcw, Square, Trash2, Upload } from "lucide-react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { FormAction, StackRow } from "@/components/stacks-table-workspace/types";
import { isRunningStack } from "@/components/stacks-table-workspace/utils";
import { LinkButton } from "@/components/ui/link-button";

type StackRowActionsCellProps = {
	stack: StackRow;
	includeUntracked: boolean;
	detailEnvironmentSuffix: string;
	onWatchStack: (stackId: string) => void;
	deployStackAction: FormAction;
	destroyStackAction: FormAction;
	adoptComposeProjectAction: FormAction;
	controlComposeProjectAction: FormAction;
};

function ConfigFileFields({
	configFiles,
	actionName,
}: {
	configFiles: string[];
	actionName: string;
}) {
	return configFiles.map((configFile) => (
		<input
			key={`${actionName}-${configFile}`}
			type="hidden"
			name="configFiles"
			value={configFile}
		/>
	));
}

function TrackedStackActions({
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
				title={`Destroy stack ${stack.name}`}
				description="This will stop and remove the stack resources."
				triggerLabel=""
				confirmLabel="Destroy"
				pendingLabel="Destroying..."
				triggerVariant="ghost"
				triggerSize="xs"
				disabled={stack.isProtected}
				hiddenFields={{ stackId: stack.stackId }}
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
	);
}

function UntrackedComposeActions({
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
						<ConfigFileFields configFiles={stack.configFiles} actionName="stop" />
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
						<ConfigFileFields configFiles={stack.configFiles} actionName="restart" />
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
					<ConfigFileFields configFiles={stack.configFiles} actionName="start" />
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

function AdoptUntrackedStackAction({
	stack,
	adoptComposeProjectAction,
}: {
	stack: Extract<StackRow, { type: "untracked" }>;
	adoptComposeProjectAction: FormAction;
}) {
	return (
		<form action={adoptComposeProjectAction}>
			<input type="hidden" name="projectName" value={stack.slug} />
			<ConfigFileFields configFiles={stack.configFiles} actionName="adopt" />
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

export function StackRowActionsCell({
	stack,
	includeUntracked,
	detailEnvironmentSuffix,
	onWatchStack,
	deployStackAction,
	destroyStackAction,
	adoptComposeProjectAction,
	controlComposeProjectAction,
}: StackRowActionsCellProps) {
	return (
		<div className="flex items-center justify-end gap-1">
			{stack.type === "tracked" ? (
				<TrackedStackActions
					stack={stack}
					detailEnvironmentSuffix={detailEnvironmentSuffix}
					onWatchStack={onWatchStack}
					deployStackAction={deployStackAction}
					destroyStackAction={destroyStackAction}
				/>
			) : includeUntracked ? (
				<UntrackedComposeActions
					stack={stack}
					controlComposeProjectAction={controlComposeProjectAction}
				/>
			) : null}
			{stack.type === "untracked" && includeUntracked ? (
				<AdoptUntrackedStackAction
					stack={stack}
					adoptComposeProjectAction={adoptComposeProjectAction}
				/>
			) : null}
		</div>
	);
}
