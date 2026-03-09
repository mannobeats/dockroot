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
			<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.03]">
				<svg className="h-6 w-6 text-muted/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
				</svg>
			</div>
			<p className="mt-4 text-sm font-medium">{title}</p>
			{description ? <p className="mt-1.5 text-xs text-muted">{description}</p> : null}
			{children}
			{actions ? <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
		</Panel>
	);
}
