import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export const LogBlock = forwardRef<HTMLPreElement, HTMLAttributes<HTMLPreElement>>(
	({ className, children, ...props }, ref) => {
		return (
			<pre
				ref={ref}
				className={cn(
					"log-viewport rounded-lg border border-default/10 bg-console text-xs leading-5 text-console-foreground",
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
