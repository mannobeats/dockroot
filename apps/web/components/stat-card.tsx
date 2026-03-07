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
		<div className="rounded-xl border border-default/20 bg-surface p-4 sm:p-5">
			<div className="flex items-center justify-between">
				<span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
					{label}
				</span>
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
					<Icon className="h-4 w-4" />
				</div>
			</div>
			<div className="mt-6 space-y-1">
				<p className="text-3xl font-semibold tracking-tight">{value}</p>
				<p className="text-sm text-muted">{detail}</p>
			</div>
		</div>
	);
}
