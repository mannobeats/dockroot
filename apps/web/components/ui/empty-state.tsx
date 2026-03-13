import type { ReactNode } from "react";
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
		<div className={cn("rounded-lg border border-dashed border-default/15 p-8 text-center", className)}>
			<p className="text-sm font-medium text-muted">{title}</p>
			{description ? <p className="mt-1 text-xs text-muted/70">{description}</p> : null}
			{children}
			{actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
		</div>
	);
}
