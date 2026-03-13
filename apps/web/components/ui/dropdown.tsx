"use client";

import { ChevronDown } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/cn";

/* ── Context ──────────────────────────────────── */

interface DropdownContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
	triggerId: string;
	listboxId: string;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdown() {
	const ctx = useContext(DropdownContext);
	if (!ctx) throw new Error("Dropdown compound components must be used inside <Dropdown>");
	return ctx;
}

/* ── Root ─────────────────────────────────────── */

export function Dropdown({ children, className }: { children: ReactNode; className?: string }) {
	const [open, setOpen] = useState(false);
	const id = useId();
	const rootRef = useRef<HTMLDivElement>(null);

	const handleClose = useCallback(() => setOpen(false), []);

	useEffect(() => {
		if (!open) return;

		function onClickOutside(event: MouseEvent) {
			if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
				handleClose();
			}
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				handleClose();
			}
		}

		document.addEventListener("mousedown", onClickOutside);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onClickOutside);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, handleClose]);

	return (
		<DropdownContext.Provider
			value={{
				open,
				setOpen,
				triggerId: `${id}-trigger`,
				listboxId: `${id}-listbox`,
			}}
		>
			<div ref={rootRef} className={cn("relative", className)}>
				{children}
			</div>
		</DropdownContext.Provider>
	);
}

/* ── Trigger ──────────────────────────────────── */

export function DropdownTrigger({
	children,
	className,
	placeholder = "Select...",
	size = "sm",
}: {
	children?: ReactNode;
	className?: string;
	placeholder?: string;
	size?: "sm" | "md";
}) {
	const { open, setOpen, triggerId, listboxId } = useDropdown();

	const sizeClasses = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";

	return (
		<button
			type="button"
			id={triggerId}
			role="combobox"
			aria-expanded={open}
			aria-haspopup="listbox"
			aria-controls={listboxId}
			onClick={() => setOpen(!open)}
			className={cn(
				"flex w-full items-center justify-between gap-2 rounded-lg border border-default/20 bg-surface outline-none transition-all duration-150",
				"hover:border-default/30 focus:border-accent/40 focus:ring-2 focus:ring-accent/10",
				sizeClasses,
				open && "border-accent/40 ring-2 ring-accent/10",
				className,
			)}
		>
			<span className="truncate">
				{children || <span className="text-muted">{placeholder}</span>}
			</span>
			<ChevronDown
				className={cn(
					"h-3 w-3 shrink-0 text-muted transition-transform duration-150",
					open && "rotate-180",
				)}
			/>
		</button>
	);
}

/* ── Menu ─────────────────────────────────────── */

export function DropdownMenu({
	children,
	className,
	align = "start",
	width = "trigger",
}: {
	children: ReactNode;
	className?: string;
	align?: "start" | "end";
	width?: "trigger" | "auto";
}) {
	const { open, listboxId, triggerId } = useDropdown();

	if (!open) return null;

	return (
		<div
			id={listboxId}
			role="listbox"
			aria-labelledby={triggerId}
			className={cn(
				"absolute z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-default/15 bg-surface py-1 shadow-[var(--shadow-lg)]",
				"animate-in",
				width === "trigger" ? "left-0 right-0" : "min-w-[160px]",
				align === "end" && "right-0 left-auto",
				className,
			)}
		>
			{children}
		</div>
	);
}

/* ── Item ─────────────────────────────────────── */

export function DropdownItem({
	children,
	value,
	selected,
	onSelect,
	className,
	disabled,
}: {
	children: ReactNode;
	value?: string;
	selected?: boolean;
	onSelect?: (value: string) => void;
	className?: string;
	disabled?: boolean;
}) {
	const { setOpen } = useDropdown();

	return (
		<button
			type="button"
			role="option"
			aria-selected={selected}
			disabled={disabled}
			onClick={() => {
				if (disabled) return;
				onSelect?.(value ?? "");
				setOpen(false);
			}}
			className={cn(
				"flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs outline-none transition-colors",
				"hover:bg-foreground/[0.04] focus:bg-foreground/[0.04]",
				selected && "bg-foreground/[0.06] font-medium",
				disabled && "pointer-events-none opacity-40",
				className,
			)}
		>
			{children}
		</button>
	);
}

/* ── Separator ────────────────────────────────── */

export function DropdownSeparator({ className }: { className?: string }) {
	return <div className={cn("my-1 h-px bg-default/8", className)} />;
}

/* ── Label ────────────────────────────────────── */

export function DropdownLabel({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<p
			className={cn(
				"px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted",
				className,
			)}
		>
			{children}
		</p>
	);
}
