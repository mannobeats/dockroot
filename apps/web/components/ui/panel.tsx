import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const panelVariants = cva("rounded-xl border bg-surface", {
	variants: {
		padding: {
			none: "",
			sm: "p-4",
			md: "p-5",
		},
		tone: {
			default: "border-default/10",
			subtle: "border-default/40",
			dashed: "border-dashed border-default/10",
		},
	},
	defaultVariants: {
		padding: "none",
		tone: "default",
	},
});

type PanelProps = HTMLAttributes<HTMLDivElement> &
	VariantProps<typeof panelVariants>;

export function Panel({ className, padding, tone, ...props }: PanelProps) {
	return <div className={cn(panelVariants({ padding, tone }), className)} {...props} />;
}

export function PanelHeader({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("flex items-start justify-between gap-3 border-b border-default/10 px-4 py-3", className)}>
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
	return <h2 className={cn("text-sm font-semibold", className)}>{children}</h2>;
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
	return <div className={cn("p-4", className)}>{children}</div>;
}
