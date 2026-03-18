import type { FormAction, StackRow } from "@/components/stacks-table-workspace/types";
import { TrackedStackActions } from "./row-tracked-actions";
import { AdoptUntrackedStackAction, UntrackedComposeActions } from "./row-untracked-actions";

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
