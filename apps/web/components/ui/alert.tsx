import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const alertVariants = cva("rounded-xl px-4 py-3 text-sm", {
	variants: {
		variant: {
			error: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
			info: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
		},
	},
	defaultVariants: {
		variant: "error",
	},
});

type AlertProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
	return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}
