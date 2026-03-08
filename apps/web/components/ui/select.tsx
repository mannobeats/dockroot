import type { SelectHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const selectVariants = cva(
	"w-full rounded-lg border border-default/10 bg-background text-sm outline-none transition-colors focus:border-accent",
	{
		variants: {
			size: {
				sm: "h-9 px-3",
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
