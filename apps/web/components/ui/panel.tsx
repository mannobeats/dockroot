import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const panelVariants = cva("rounded-xl border bg-surface transition-colors duration-150", {
	variants: {
		padding: {
			none: "",
			sm: "p-3",
			md: "p-4",
			lg: "p-5",
		},
		tone: {
			default: "border-default/18 shadow-[var(--shadow-xs)]",
			subtle: "border-default/40 shadow-[var(--shadow-sm)]",
			dashed: "border-dashed border-default/15",
			ghost: "border-transparent shadow-none bg-transparent",
		},
		interactive: {
			true: "cursor-pointer hover:shadow-[var(--shadow-sm)] hover:border-default/20",
			false: "",
		},
	},
	defaultVariants: {
		padding: "none",
		tone: "default",
		interactive: false,
	},
});

type PanelProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof panelVariants>;

export function Panel({ className, padding, tone, interactive, ...props }: PanelProps) {
	return (
		<div className={cn(panelVariants({ padding, tone, interactive }), className)} {...props} />
	);
}

export function PanelHeader({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div
			className={cn(
				"flex items-start justify-between gap-3 border-b border-default/8 px-4 py-3",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function PanelTitle({ className, children }: { className?: string; children: ReactNode }) {
	return <h2 className={cn("text-sm font-semibold tracking-tight", className)}>{children}</h2>;
}

export function PanelDescription({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return <p className={cn("mt-0.5 text-xs text-muted", className)}>{children}</p>;
}

export function PanelContent({ className, children }: { className?: string; children: ReactNode }) {
	return <div className={cn("p-4", className)}>{children}</div>;
}
