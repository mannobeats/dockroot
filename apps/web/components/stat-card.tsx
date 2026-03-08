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
		<div className="group rounded-xl border border-default/10 bg-surface p-5 transition-all hover:border-default/20 hover:shadow-sm">
			<div className="flex items-center justify-between">
				<span className="text-xs font-medium text-muted">{label}</span>
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04] text-muted transition-colors group-hover:bg-foreground/[0.06]">
					<Icon className="h-4 w-4" />
				</div>
			</div>
			<div className="mt-3">
				<p className="text-2xl font-semibold tracking-tight">{value}</p>
				<p className="mt-1 text-sm text-muted">{detail}</p>
			</div>
		</div>
	);
}
