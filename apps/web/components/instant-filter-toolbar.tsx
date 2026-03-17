"use client";

import { RotateCcw, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type ToolbarFilter = {
	id: string;
	value: string;
	onChange: (value: string) => void;
	options: Array<{ value: string; label: string }>;
	className?: string;
};

export function InstantFilterToolbar({
	searchId,
	searchPlaceholder,
	query,
	onQueryChange,
	filters = [],
	resultCount,
	totalCount,
	onReset,
	enableShortcut = true,
}: {
	searchId: string;
	searchPlaceholder: string;
	query: string;
	onQueryChange: (value: string) => void;
	filters?: ToolbarFilter[];
	resultCount: number;
	totalCount: number;
	onReset?: () => void;
	enableShortcut?: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const hasActiveFilters =
		query.trim().length > 0 || filters.some((filter) => filter.value !== filter.options[0]?.value);
	const isFiltered = resultCount !== totalCount;

	useEffect(() => {
		if (!enableShortcut) {
			return;
		}

		function isTypingTarget(target: EventTarget | null) {
			if (!(target instanceof HTMLElement)) {
				return false;
			}

			const tag = target.tagName.toLowerCase();
			return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			if (isTypingTarget(event.target)) {
				return;
			}
			event.preventDefault();
			inputRef.current?.focus();
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [enableShortcut]);

	const hasFiltersOrReset = filters.length > 0 || onReset;

	return (
		<div className="border-b border-default/8 px-3 py-2.5 space-y-2">
			{/* Row 1: Full-width search */}
			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
				<Input
					ref={inputRef}
					id={searchId}
					type="search"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder={`${searchPlaceholder}${enableShortcut ? " (press /)" : ""}`}
					className="w-full pl-9"
				/>
			</div>

			{/* Row 2: Filters + result count + reset — single compact line */}
			{hasFiltersOrReset ? (
				<div className="flex items-center gap-2">
					{/* Result count on the left */}
					{isFiltered ? (
						<span className="shrink-0 text-[11px] tabular-nums text-muted">
							Showing {resultCount} of {totalCount}
						</span>
					) : (
						<span className="shrink-0 text-[11px] text-muted">
							{totalCount} total
						</span>
					)}

					{/* Spacer pushes filters to the right */}
					<div className="flex-1" />

					{/* Filter dropdowns */}
					{filters.map((filter) => (
						<Select
							key={filter.id}
							value={filter.value}
							onChange={(event) => filter.onChange(event.target.value)}
							className={filter.className || "h-7 min-w-32 text-xs"}
						>
							{filter.options.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</Select>
					))}

					{/* Reset */}
					{onReset ? (
						<button
							type="button"
							onClick={onReset}
							disabled={!hasActiveFilters}
							className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-default/18 px-2 text-xs text-muted transition-colors hover:border-default/28 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
						>
							<RotateCcw className="h-3 w-3" />
							Reset
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
