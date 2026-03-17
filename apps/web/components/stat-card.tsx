import type { LucideIcon } from "lucide-react";

export function StatCard({
	label,
	value,
	detail,
	icon: Icon,
}: {
	label: string;
	value: string;
	detail: string;
	icon: LucideIcon;
}) {
	return (
		<div className="flex items-center gap-3 rounded-lg border border-default/10 bg-surface p-3 shadow-[var(--shadow-xs)]">
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04]">
				<Icon className="h-4 w-4 text-muted" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-xl font-bold tracking-tight leading-none">{value}</p>
				<p className="truncate mt-0.5 text-[11px] text-muted">
					{label} · {detail}
				</p>
			</div>
		</div>
	);
}
