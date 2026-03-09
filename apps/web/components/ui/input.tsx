import type { InputHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const inputVariants = cva(
	"w-full rounded-xl border bg-surface text-sm outline-none transition-all duration-200 placeholder:text-muted/50 focus:border-accent/50 focus:ring-2 focus:ring-accent/10 shadow-[var(--shadow-xs)]",
	{
		variants: {
			size: {
				sm: "h-9 px-3.5",
				md: "h-10 px-4",
			},
			withIcon: {
				true: "pl-10",
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
		<input
			className={cn("border-default/12", inputVariants({ size: inputSize, withIcon }), className)}
			{...props}
		/>
	);
}
