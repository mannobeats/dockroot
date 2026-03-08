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
		<Panel padding="sm" className={className}>
			<p className="text-xs text-muted">{label}</p>
			<p className={cn("mt-1 text-2xl font-semibold", valueClassName)}>{value}</p>
			{description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
		</Panel>
	);
}
