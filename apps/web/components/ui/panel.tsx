import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const panelVariants = cva("rounded-2xl border bg-surface transition-all duration-200", {
	variants: {
		padding: {
			none: "",
			sm: "p-4",
			md: "p-5",
			lg: "p-6",
		},
		tone: {
			default: "border-default/10 shadow-[var(--shadow-xs)]",
			subtle: "border-default/40 shadow-[var(--shadow-sm)]",
			dashed: "border-dashed border-default/15",
			ghost: "border-transparent shadow-none bg-transparent",
		},
		interactive: {
			true: "cursor-pointer hover:shadow-[var(--shadow-md)] hover:border-default/20 hover:-translate-y-0.5 active:translate-y-0",
			false: "",
		},
	},
	defaultVariants: {
		padding: "none",
		tone: "default",
		interactive: false,
	},
});

type PanelProps = HTMLAttributes<HTMLDivElement> &
	VariantProps<typeof panelVariants>;

export function Panel({ className, padding, tone, interactive, ...props }: PanelProps) {
	return <div className={cn(panelVariants({ padding, tone, interactive }), className)} {...props} />;
}

export function PanelHeader({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("flex items-start justify-between gap-3 border-b border-default/8 px-5 py-3.5", className)}>
			{children}
		</div>
	);
}

export function PanelTitle({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return <h2 className={cn("text-sm font-semibold tracking-tight", className)}>{children}</h2>;
}

export function PanelDescription({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return <p className={cn("mt-1 text-xs text-muted", className)}>{children}</p>;
}

export function PanelContent({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return <div className={cn("p-5", className)}>{children}</div>;
}
