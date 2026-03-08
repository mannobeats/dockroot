"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function FormSubmitButton({
	label,
	pendingLabel,
	className,
	disabled = false,
	title,
}: {
	label: string;
	pendingLabel?: string;
	className?: string;
	disabled?: boolean;
	title?: string;
}) {
	const { pending } = useFormStatus();

	return (
		<button
			type="submit"
			disabled={pending || disabled}
			title={title}
			className={
				className ||
				"inline-flex h-9 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
			}
		>
			{pending ? (
				<>
					<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
					{pendingLabel || "Working..."}
				</>
			) : (
				label
			)}
		</button>
	);
}
