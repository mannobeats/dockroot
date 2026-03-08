import type { ReactNode } from "react";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

export function EmptyState({
	title,
	description,
	actions,
	children,
	className,
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<Panel tone="dashed" className={cn("p-12 text-center", className)}>
			<p className="text-sm font-medium">{title}</p>
			{description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
			{children}
			{actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
		</Panel>
	);
}
