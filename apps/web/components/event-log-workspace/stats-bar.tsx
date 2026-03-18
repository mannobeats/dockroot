import { Trash2 } from "lucide-react";
import type { EventCounts } from "./types";

export function EventLogStatsBar({
	totalCount,
	counts,
	selectedCount,
	isPending,
	onDeleteSelected,
	onClearAll,
}: {
	totalCount: number;
	counts: EventCounts;
	selectedCount: number;
	isPending: boolean;
	onDeleteSelected: () => void;
	onClearAll: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-default/8 px-3 py-2 text-xs text-muted">
			<span className="font-semibold text-foreground">{totalCount} total events</span>
			<span className="flex items-center gap-1">
				<span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
				{counts.info} info
			</span>
			<span className="flex items-center gap-1">
				<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
				{counts.success} success
			</span>
			<span className="flex items-center gap-1">
				<span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
				{counts.warning} warning
			</span>
			<span className="flex items-center gap-1">
				<span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
				{counts.error} error
			</span>

			<div className="ml-auto flex items-center gap-2">
				{selectedCount > 0 ? (
					<button
						type="button"
						disabled={isPending}
						onClick={onDeleteSelected}
						className="flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-500 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
					>
						<Trash2 className="h-3 w-3" />
						Remove {selectedCount} selected
					</button>
				) : null}
				{totalCount > 0 ? (
					<button
						type="button"
						disabled={isPending}
						onClick={onClearAll}
						className="text-[11px] font-medium text-muted transition-colors hover:text-rose-500 disabled:opacity-50"
					>
						Clear all
					</button>
				) : null}
			</div>
		</div>
	);
}
