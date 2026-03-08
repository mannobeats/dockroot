import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const alertVariants = cva("rounded-lg px-3.5 py-2.5 text-sm", {
	variants: {
		variant: {
			error: "bg-danger/10 text-danger",
			info: "bg-accent/10 text-foreground",
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
