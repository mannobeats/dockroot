"use client";

import { Database, Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ActionModal } from "@/components/action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type FormAction = (formData: FormData) => void | Promise<void>;

export function CreateVolumeModal({
	action,
	environmentId,
}: {
	action: FormAction;
	environmentId: string;
}) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState("");
	const formRef = useRef<HTMLFormElement>(null);
	const resetForm = useCallback(() => {
		setError("");
		formRef.current?.reset();
	}, []);

	return (
		<ActionModal
			trigger="Create volume"
			triggerIcon={Plus}
			title="Create volume"
			description="Create a new Docker volume for persistent data."
			icon={Database}
			open={open}
			onOpenChange={(value) => {
				setOpen(value);
				if (!value) {
					resetForm();
				}
			}}
		>
			<form
				ref={formRef}
				action={async (formData) => {
					setError("");
					try {
						await action(formData);
						resetForm();
						setOpen(false);
					} catch (submitError) {
						setError(
							submitError instanceof Error ? submitError.message : "Unable to create volume.",
						);
					}
				}}
				className="space-y-4"
			>
				<input type="hidden" name="environmentId" value={environmentId} />
				<Field>
					<FieldLabel htmlFor="modal-volume-name">Volume name</FieldLabel>
					<Input id="modal-volume-name" name="name" required placeholder="app-data" />
					<FieldHint>
						Use a stable name you can reference from stacks or standalone containers.
					</FieldHint>
				</Field>
				<Field>
					<FieldLabel htmlFor="modal-volume-driver">Driver</FieldLabel>
					<Select id="modal-volume-driver" name="driver" defaultValue="local">
						<option value="local">local</option>
					</Select>
				</Field>
				{error ? <Alert variant="error">{error}</Alert> : null}
				<div className="flex justify-end gap-2 pt-2">
					<Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<FormSubmitButton label="Create volume" pendingLabel="Creating..." />
				</div>
			</form>
		</ActionModal>
	);
}
