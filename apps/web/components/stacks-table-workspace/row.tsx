"use client";

import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Fragment } from "react";
import { StackRowActionsCell } from "@/components/stacks-table-workspace/row-actions-cell";
import { StackRowServicesPanel } from "@/components/stacks-table-workspace/row-services-panel";
import type { FormAction, StackRow } from "@/components/stacks-table-workspace/types";
import { normalizeStatus } from "@/components/stacks-table-workspace/utils";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { DataTableCell, DataTableRow } from "@/components/ui/data-table";
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
					<StackRowActionsCell
						stack={stack}
						includeUntracked={includeUntracked}
						detailEnvironmentSuffix={detailEnvironmentSuffix}
						onWatchStack={onWatchStack}
						deployStackAction={deployStackAction}
						destroyStackAction={destroyStackAction}
						adoptComposeProjectAction={adoptComposeProjectAction}
						controlComposeProjectAction={controlComposeProjectAction}
					/>
				</DataTableCell>
			</DataTableRow>
			{expanded ? <StackRowServicesPanel stack={stack} rowKey={rowKey} /> : null}
		</Fragment>
	);
}
