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
				"inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
			}
		>
			{pending ? (
				<>
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					{pendingLabel || "Working..."}
				</>
			) : (
				label
			)}
		</button>
	);
}
