import { cva, type VariantProps } from "class-variance-authority";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const selectVariants = cva(
	"w-full rounded-lg border border-default/34 bg-surface-raised/90 text-sm text-foreground outline-none transition-all duration-150 hover:border-default/50 focus:border-accent/58 focus:ring-2 focus:ring-accent/18",
	{
		variants: {
			size: {
				sm: "h-8 px-3",
				md: "h-9 px-3.5",
			},
		},
		defaultVariants: {
			size: "sm",
		},
	},
);

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> &
	Omit<VariantProps<typeof selectVariants>, "size"> & {
		selectSize?: VariantProps<typeof selectVariants>["size"];
	};

export function Select({ className, selectSize, ...props }: SelectProps) {
	return <select className={cn(selectVariants({ size: selectSize }), className)} {...props} />;
}
