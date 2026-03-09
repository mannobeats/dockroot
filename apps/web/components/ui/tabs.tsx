import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("flex gap-0 overflow-x-auto border-b border-default/8", className)}
			{...props}
		/>
	);
}

export function TabsTrigger({
	className,
	active = false,
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
	return (
		<button
			type="button"
			data-active={active}
			className={cn(
				"relative border-b-2 border-transparent px-4 py-2.5 text-[13px] font-medium text-muted transition-all duration-200 hover:text-foreground data-[active=true]:text-foreground data-[active=true]:border-accent",
				className,
			)}
			{...props}
		/>
	);
}

export function TabsPanel({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return <div className={cn("mt-6 animate-in", className)}>{children}</div>;
}
