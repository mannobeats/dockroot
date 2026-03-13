"use client";

import { AlertTriangle, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type FormAction = (formData: FormData) => void | Promise<void>;

type ModalOption = {
	name: string;
	label: string;
	description?: string;
	defaultChecked?: boolean;
};

export function DestructiveActionModal({
	action,
	onConfirm,
	title,
	description,
	triggerLabel,
	triggerIcon,
	confirmLabel = "Confirm",
	pendingLabel = "Working...",
	triggerVariant = "danger",
	triggerSize = "xs",
	triggerClassName,
	disabled = false,
	hiddenFields = {},
	options = [],
	requireAcknowledgement = true,
	acknowledgementLabel = "I understand this action is destructive and cannot be undone.",
}: {
	action: FormAction;
	onConfirm?: () => void;
	title: string;
	description: string;
	triggerLabel: string;
	triggerIcon?: ReactNode;
	confirmLabel?: string;
	pendingLabel?: string;
	triggerVariant?: "danger" | "warning" | "quietDanger" | "outline" | "ghost";
	triggerSize?: "xs" | "sm" | "md";
	triggerClassName?: string;
	disabled?: boolean;
	hiddenFields?: Record<string, string | string[]>;
	options?: ModalOption[];
	requireAcknowledgement?: boolean;
	acknowledgementLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	const [acknowledged, setAcknowledged] = useState(!requireAcknowledgement);
	const titleId = useId();
	const descriptionId = useId();
	const optionsId = useId();

	const optionDefaults = useMemo(
		() =>
			options.reduce<Record<string, boolean>>((acc, option) => {
				acc[option.name] = Boolean(option.defaultChecked);
				return acc;
			}, {}),
		[options],
	);
	const [optionState, setOptionState] = useState(optionDefaults);

	const resetState = useCallback(() => {
		setAcknowledged(!requireAcknowledgement);
		setOptionState(optionDefaults);
		setOpen(false);
	}, [optionDefaults, requireAcknowledgement]);

	useEffect(() => {
		if (!open) {
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
			if (event.key === "Escape") {
				event.preventDefault();
				resetState();
				return;
			}

			if (event.key.toLowerCase() === "x" && !isTypingTarget(event.target)) {
				event.preventDefault();
				resetState();
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, resetState]);

	useEffect(() => {
		if (disabled && open) {
			resetState();
		}
	}, [disabled, open, resetState]);

	return (
		<>
			<button
				type="button"
				disabled={disabled}
				onClick={() => setOpen(true)}
				className={cn(
					buttonVariants({
						variant: triggerVariant,
						size: triggerSize,
					}),
					triggerClassName,
				)}
			>
				{triggerIcon || triggerLabel}
			</button>

			{open ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
					<button
						type="button"
						aria-label="Close confirmation dialog"
						onClick={resetState}
						className="absolute inset-0 h-full w-full cursor-default"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						aria-describedby={descriptionId}
						className="relative z-10 w-full max-w-md rounded-xl border border-danger/15 bg-surface shadow-[var(--shadow-lg)]"
					>
						<div className="flex items-start justify-between gap-3 border-b border-default/8 px-4 py-3">
							<div className="flex items-start gap-2.5">
								<div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
									<AlertTriangle className="h-3 w-3" />
								</div>
								<div>
									<h2 id={titleId} className="text-sm font-semibold">
										{title}
									</h2>
									<p id={descriptionId} className="mt-0.5 text-xs text-muted">
										{description}
									</p>
								</div>
							</div>
							<button
								type="button"
								onClick={resetState}
								className="rounded-md p-1 text-muted transition-colors hover:text-foreground"
								aria-label="Close"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						<form
							action={action}
							className="p-4 space-y-3"
							onSubmit={() => {
								onConfirm?.();
								setOpen(false);
							}}
						>
							<input
								type="hidden"
								name="__confirmDestructive"
								value={acknowledged ? "yes" : "no"}
							/>
							{Object.entries(hiddenFields).flatMap(([name, value]) => {
								const values = Array.isArray(value) ? value : [value];
								return values.map((entry, index) => (
									<input key={`${name}-${index}`} type="hidden" name={name} value={entry} />
								));
							})}

							{options.length ? (
								<div className="space-y-2 rounded-lg border border-default/8 p-3" id={optionsId}>
									{options.map((option) => (
										<label key={option.name} className="flex items-start gap-2">
											<input
												type="checkbox"
												name={option.name}
												value="true"
												checked={Boolean(optionState[option.name])}
												onChange={(event) =>
													setOptionState((current) => ({
														...current,
														[option.name]: event.target.checked,
													}))
												}
												className="mt-0.5 h-3.5 w-3.5 rounded border-default/30 bg-background"
											/>
											<span>
												<span className="block text-xs font-medium">{option.label}</span>
												{option.description ? (
													<span className="block text-[11px] text-muted">{option.description}</span>
												) : null}
											</span>
										</label>
									))}
								</div>
							) : null}

							{requireAcknowledgement ? (
								<label className="flex items-start gap-2 rounded-lg border border-default/8 p-3">
									<input
										type="checkbox"
										checked={acknowledged}
										onChange={(event) => setAcknowledged(event.target.checked)}
										className="mt-0.5 h-3.5 w-3.5 rounded border-default/30 bg-background"
									/>
									<span className="text-xs">{acknowledgementLabel}</span>
								</label>
							) : null}

							<div className="flex justify-end gap-2 pt-1">
								<Button type="button" variant="ghost" size="sm" onClick={resetState}>
									Cancel
								</Button>
								<FormSubmitButton
									label={confirmLabel}
									pendingLabel={pendingLabel}
									variant="danger"
									size="sm"
									disabled={!acknowledged}
								/>
							</div>
						</form>
					</div>
				</div>
			) : null}
		</>
	);
}
