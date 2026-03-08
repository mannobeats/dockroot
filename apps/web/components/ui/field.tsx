import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Field({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("space-y-1.5", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
	return <label className={cn("text-xs font-medium text-muted", className)} {...props} />;
}

export function FieldHint({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return <p className={cn("text-xs text-muted", className)}>{children}</p>;
}
