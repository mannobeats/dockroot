"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export function PopoverCard({
	trigger,
	children,
	align = "start",
	disabled = false,
	contentClassName,
}: {
	trigger: ReactNode;
	children: ReactNode;
	align?: "start" | "center" | "end";
	disabled?: boolean;
	contentClassName?: string;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			return;
		}

		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
			}
		};

		window.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="relative inline-flex">
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				disabled={disabled}
				aria-haspopup="dialog"
				aria-expanded={open}
				className="inline-flex disabled:cursor-not-allowed disabled:opacity-50"
			>
				{trigger}
			</button>
			{open ? (
				<div
					role="dialog"
					aria-modal="false"
					className={cn(
						"absolute top-full z-50 mt-2 w-[min(24rem,84vw)] rounded-xl border border-default/18 bg-surface/98 p-3 shadow-[var(--shadow-lg)] backdrop-blur-sm",
						align === "center"
							? "left-1/2 -translate-x-1/2"
							: align === "end"
								? "right-0"
								: "left-0",
						contentClassName,
					)}
				>
					{children}
				</div>
			) : null}
		</div>
	);
}
