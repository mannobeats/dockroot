import type { SelectHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const selectVariants = cva(
	"w-full rounded-xl border border-default/12 bg-surface text-sm outline-none transition-all duration-200 focus:border-accent/50 focus:ring-2 focus:ring-accent/10 shadow-[var(--shadow-xs)]",
	{
		variants: {
			size: {
				sm: "h-9 px-3.5",
				md: "h-10 px-4",
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
