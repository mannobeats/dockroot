import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
	"inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium tracking-wide",
	{
		variants: {
			variant: {
				default: "bg-foreground/[0.05] text-muted",
				success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
				warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
				danger: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
				accent: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
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
