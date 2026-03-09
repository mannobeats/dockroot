import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export const LogBlock = forwardRef<HTMLPreElement, HTMLAttributes<HTMLPreElement>>(
	({ className, children, ...props }, ref) => {
		return (
			<pre
				ref={ref}
				className={cn(
					"log-viewport rounded-xl border border-default/10 bg-console text-xs leading-6 text-console-foreground shadow-[var(--shadow-sm)]",
					className,
				)}
				{...props}
			>
				{children as ReactNode}
			</pre>
		);
	},
);

LogBlock.displayName = "LogBlock";
