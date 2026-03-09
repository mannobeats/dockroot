import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
	"inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.97]",
	{
		variants: {
			variant: {
				primary:
					"bg-accent text-accent-foreground shadow-[var(--shadow-sm)] hover:opacity-90 hover:shadow-[var(--shadow-md)]",
				secondary:
					"border border-default/12 bg-surface text-foreground shadow-[var(--shadow-xs)] hover:border-default/25 hover:shadow-[var(--shadow-sm)]",
				outline:
					"border border-default/12 bg-transparent text-muted hover:border-default/25 hover:text-foreground hover:bg-foreground/[0.03]",
				ghost: "text-muted hover:bg-foreground/[0.05] hover:text-foreground",
				danger:
					"border border-danger/20 bg-danger/8 text-danger shadow-[var(--shadow-xs)] hover:bg-danger/12",
				warning:
					"border border-warning/20 bg-warning/8 text-warning shadow-[var(--shadow-xs)] hover:bg-warning/12",
				quietDanger:
					"border border-default/12 bg-transparent text-muted hover:text-danger hover:border-danger/20",
			},
			size: {
				xs: "h-7 px-2.5 text-xs",
				sm: "h-8 px-3.5 text-xs",
				md: "h-9 px-4 text-sm",
				lg: "h-10 px-5 text-sm",
				icon: "h-8 w-8",
			},
			fullWidth: {
				true: "w-full",
				false: "",
			},
		},
		defaultVariants: {
			variant: "primary",
			size: "md",
			fullWidth: false,
		},
	},
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, fullWidth, type = "button", ...props }, ref) => {
		return (
			<button
				ref={ref}
				type={type}
				className={cn(buttonVariants({ variant, size, fullWidth }), className)}
				{...props}
			/>
		);
	},
);

Button.displayName = "Button";
