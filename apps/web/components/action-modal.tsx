"use client";

import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ActionModal({
	trigger,
	triggerIcon: TriggerIcon,
	triggerVariant = "primary",
	triggerSize = "sm",
	title,
	description,
	icon: Icon,
	children,
	open: controlledOpen,
	onOpenChange,
}: {
	trigger: string;
	triggerIcon?: LucideIcon;
	triggerVariant?: "primary" | "secondary" | "outline" | "ghost";
	triggerSize?: "xs" | "sm" | "md";
	title: string;
	description?: string;
	icon?: LucideIcon;
	children: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const [internalOpen, setInternalOpen] = useState(false);
	const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
	const setOpen = onOpenChange || setInternalOpen;

	useEffect(() => {
		if (!isOpen) return;

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				setOpen(false);
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen, setOpen]);

	return (
		<>
			<Button
				type="button"
				variant={triggerVariant}
				size={triggerSize}
				onClick={() => setOpen(true)}
			>
				{TriggerIcon ? <TriggerIcon className="mr-1.5 h-3.5 w-3.5" /> : null}
				{trigger}
			</Button>

			{isOpen ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
					<button
						type="button"
						aria-label="Close modal"
						onClick={() => setOpen(false)}
						className="absolute inset-0 h-full w-full cursor-default"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-label={title}
						className="relative z-10 w-full max-w-md rounded-xl border border-default/10 bg-surface shadow-[var(--shadow-lg)]"
					>
						{/* Header */}
						<div className="flex items-center justify-between border-b border-default/8 px-4 py-3">
							<div className="flex items-center gap-2.5">
								{Icon ? <Icon className="h-4 w-4 text-muted" /> : null}
								<div>
									<p className="text-sm font-semibold">{title}</p>
									{description ? <p className="text-[11px] text-muted">{description}</p> : null}
								</div>
							</div>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="rounded-md p-1 text-muted transition-colors hover:text-foreground"
								aria-label="Close modal"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						{/* Body */}
						<div className="p-4">{children}</div>
					</div>
				</div>
			) : null}
		</>
	);
}
