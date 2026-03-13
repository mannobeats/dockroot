import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function MetricCard({
	label,
	value,
	description,
	className,
	valueClassName,
}: {
	label: string;
	value: ReactNode;
	description?: ReactNode;
	className?: string;
	valueClassName?: string;
}) {
	return (
		<div
			className={cn(
				"rounded-lg border border-default/10 bg-surface p-3 shadow-[var(--shadow-xs)]",
				className,
			)}
		>
			<p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
			<p className={cn("mt-1 text-xl font-bold tracking-tight", valueClassName)}>{value}</p>
			{description ? <p className="mt-0.5 text-[11px] text-muted">{description}</p> : null}
		</div>
	);
}
