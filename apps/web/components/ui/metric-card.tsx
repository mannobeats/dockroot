import type { ReactNode } from "react";
import { Panel } from "@/components/ui/panel";
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
		<Panel
			padding="sm"
			className={cn("transition-all duration-200 hover:shadow-[var(--shadow-sm)]", className)}
		>
			<p className="text-xs font-medium tracking-wide uppercase text-muted">{label}</p>
			<p className={cn("mt-1.5 text-2xl font-bold tracking-tight", valueClassName)}>{value}</p>
			{description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
		</Panel>
	);
}
