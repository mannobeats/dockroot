"use client";

import type { VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function FormSubmitButton({
	label,
	pendingLabel,
	className,
	disabled = false,
	title,
	variant,
	size,
	fullWidth,
	children,
}: {
	label: string;
	pendingLabel?: string;
	className?: string;
	disabled?: boolean;
	title?: string;
	children?: ReactNode;
} & VariantProps<typeof buttonVariants>) {
	const { pending } = useFormStatus();

	return (
		<button
			type="submit"
			disabled={pending || disabled}
			title={title}
			className={cn(buttonVariants({ variant, size, fullWidth }), className)}
		>
			{pending ? (
				<>
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
					{pendingLabel || null}
				</>
			) : children ? (
				children
			) : (
				label
			)}
		</button>
	);
}
