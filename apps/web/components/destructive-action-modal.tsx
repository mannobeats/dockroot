"use client";

import { AlertTriangle, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
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
	title,
	description,
	triggerLabel,
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
	title: string;
	description: string;
	triggerLabel: string;
	confirmLabel?: string;
	pendingLabel?: string;
	triggerVariant?: "danger" | "warning" | "quietDanger" | "outline";
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

	const resetState = () => {
		setAcknowledged(!requireAcknowledgement);
		setOptionState(optionDefaults);
		setOpen(false);
	};

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
				{triggerLabel}
			</button>

			{open ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm">
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						aria-describedby={descriptionId}
						className="w-full max-w-2xl rounded-2xl border border-danger/20 bg-surface p-6 shadow-2xl"
					>
						<div className="flex items-start justify-between gap-4">
							<div className="flex items-start gap-3">
								<div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-danger/10 text-danger">
									<AlertTriangle className="h-4 w-4" />
								</div>
								<div>
									<h2 id={titleId} className="text-xl font-semibold">
										{title}
									</h2>
								</div>
							</div>
							<button
								type="button"
								onClick={resetState}
								className="rounded-md p-1 text-muted transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
								aria-label="Close confirmation dialog"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						<p id={descriptionId} className="mt-4 text-sm text-muted">
							{description}
						</p>

						<form action={action} className="mt-6 space-y-4">
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
								<div className="space-y-3 rounded-xl border border-default/10 p-4" id={optionsId}>
									{options.map((option) => (
										<label key={option.name} className="flex items-start gap-3">
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
												className="mt-0.5 h-4 w-4 rounded border-default/30 bg-background"
											/>
											<span>
												<span className="block text-sm font-medium">{option.label}</span>
												{option.description ? (
													<span className="block text-xs text-muted">{option.description}</span>
												) : null}
											</span>
										</label>
									))}
								</div>
							) : null}

							{requireAcknowledgement ? (
								<label className="flex items-start gap-3 rounded-xl border border-default/10 p-4">
									<input
										type="checkbox"
										checked={acknowledged}
										onChange={(event) => setAcknowledged(event.target.checked)}
										className="mt-0.5 h-4 w-4 rounded border-default/30 bg-background"
									/>
									<span className="text-sm">{acknowledgementLabel}</span>
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
