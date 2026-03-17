"use client";

import { Network, Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ActionModal } from "@/components/action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type FormAction = (formData: FormData) => void | Promise<void>;

export function CreateNetworkModal({
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
			trigger="Create network"
			triggerIcon={Plus}
			title="Create network"
			description="Create a new Docker network for container communication."
			icon={Network}
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
							submitError instanceof Error ? submitError.message : "Unable to create network.",
						);
					}
				}}
				className="space-y-4"
			>
				<input type="hidden" name="environmentId" value={environmentId} />
				<Field>
					<FieldLabel htmlFor="modal-network-name">Network name</FieldLabel>
					<Input id="modal-network-name" name="name" required placeholder="app-network" />
					<FieldHint>
						Bridge is the default for app-to-app communication on a single Docker host.
					</FieldHint>
				</Field>
				<Field>
					<FieldLabel htmlFor="modal-network-driver">Driver</FieldLabel>
					<Select id="modal-network-driver" name="driver" defaultValue="bridge">
						<option value="bridge">bridge</option>
						<option value="overlay">overlay</option>
						<option value="macvlan">macvlan</option>
						<option value="host">host</option>
					</Select>
				</Field>
				{error ? <Alert variant="error">{error}</Alert> : null}
				<div className="flex justify-end gap-2 pt-2">
					<Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<FormSubmitButton label="Create network" pendingLabel="Creating..." />
				</div>
			</form>
		</ActionModal>
	);
}
