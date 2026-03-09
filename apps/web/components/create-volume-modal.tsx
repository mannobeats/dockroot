"use client";

import { Database, Plus } from "lucide-react";
import { ActionModal } from "@/components/action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Field, FieldLabel } from "@/components/ui/field";
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
	return (
		<ActionModal
			trigger="Create volume"
			triggerIcon={Plus}
			title="Create volume"
			description="Create a new Docker volume for persistent data."
			icon={Database}
		>
			<form action={action} className="space-y-4">
				<input type="hidden" name="environmentId" value={environmentId} />
				<Field>
					<FieldLabel htmlFor="modal-volume-name">Volume name</FieldLabel>
					<Input id="modal-volume-name" name="name" required placeholder="app-data" />
				</Field>
				<Field>
					<FieldLabel htmlFor="modal-volume-driver">Driver</FieldLabel>
					<Select id="modal-volume-driver" name="driver" defaultValue="local">
						<option value="local">local</option>
					</Select>
				</Field>
				<div className="flex justify-end gap-2 pt-2">
					<FormSubmitButton label="Create volume" pendingLabel="Creating..." />
				</div>
			</form>
		</ActionModal>
	);
}
