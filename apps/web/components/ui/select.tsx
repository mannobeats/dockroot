import { cva, type VariantProps } from "class-variance-authority";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const selectVariants = cva(
	"w-full rounded-lg border border-default/20 bg-surface text-sm outline-none transition-all duration-150 hover:border-default/30 focus:border-accent/40 focus:ring-2 focus:ring-accent/10",
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
