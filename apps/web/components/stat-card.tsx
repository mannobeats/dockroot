import type { LucideIcon } from "lucide-react";
import { Panel } from "@/components/ui/panel";

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
		<Panel className="group p-5 transition-all duration-200 hover:shadow-[var(--shadow-sm)] hover:-translate-y-0.5">
			<div className="flex items-center justify-between">
				<span className="text-[11px] font-medium tracking-wider uppercase text-muted">{label}</span>
				<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground/[0.04] transition-colors">
					<Icon className="h-4 w-4 text-muted" />
				</div>
			</div>
			<div className="mt-3">
				<p className="text-2xl font-bold tracking-tight">{value}</p>
				<p className="mt-1 text-sm text-muted">{detail}</p>
			</div>
		</Panel>
	);
}
