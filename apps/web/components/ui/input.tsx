import { cva, type VariantProps } from "class-variance-authority";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const inputVariants = cva(
	"w-full rounded-lg border border-default/20 bg-surface text-sm outline-none transition-all duration-150 placeholder:text-muted/40 hover:border-default/30 focus:border-accent/40 focus:ring-2 focus:ring-accent/10",
	{
		variants: {
			size: {
				sm: "h-8 px-3",
				md: "h-9 px-3.5",
			},
			withIcon: {
				true: "pl-9",
				false: "",
			},
		},
		defaultVariants: {
			size: "sm",
			withIcon: false,
		},
		compoundVariants: [
			{
				size: "md",
				withIcon: true,
				className: "pl-10",
			},
		],
	},
);

type InputProps = InputHTMLAttributes<HTMLInputElement> &
	Omit<VariantProps<typeof inputVariants>, "size"> & {
		inputSize?: VariantProps<typeof inputVariants>["size"];
	};

export function Input({ className, inputSize, withIcon, ...props }: InputProps) {
	return (
		<input className={cn(inputVariants({ size: inputSize, withIcon }), className)} {...props} />
	);
}
