import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const inputVariants = cva(
	"w-full rounded-lg border border-default/34 bg-surface-raised/90 text-sm text-foreground outline-none transition-all duration-150 placeholder:text-muted/72 hover:border-default/50 focus:border-accent/58 focus:ring-2 focus:ring-accent/18",
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

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
	{ className, inputSize, withIcon, ...props },
	ref,
) {
	return (
		<input
			ref={ref}
			className={cn(inputVariants({ size: inputSize, withIcon }), className)}
			{...props}
		/>
	);
});
