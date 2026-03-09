import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
	"inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
	{
		variants: {
			variant: {
				primary: "bg-accent text-accent-foreground hover:opacity-90",
				secondary: "border border-default/10 bg-surface text-foreground hover:border-default/20",
				outline:
					"border border-default/10 bg-background text-muted hover:border-default/20 hover:text-foreground",
				ghost: "text-muted hover:bg-foreground/[0.04] hover:text-foreground",
				danger: "border border-danger/20 bg-danger/10 text-danger hover:bg-danger/15",
				warning: "border border-warning/20 bg-warning/10 text-warning hover:bg-warning/15",
				quietDanger: "border border-default/10 bg-background text-muted hover:text-danger",
			},
			size: {
				xs: "h-7 px-2.5 text-xs",
				sm: "h-8 px-3 text-xs",
				md: "h-9 px-4 text-sm",
				lg: "h-10 px-4 text-sm",
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
