import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
	"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
	{
		variants: {
			variant: {
				default: "bg-foreground/[0.04] text-muted",
				success: "bg-success/10 text-success",
				warning: "bg-warning/10 text-warning",
				danger: "bg-danger/10 text-danger",
				accent: "bg-accent/10 text-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
	return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
