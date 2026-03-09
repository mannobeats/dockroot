"use client";

import { Network, Plus } from "lucide-react";
import { ActionModal } from "@/components/action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Field, FieldLabel } from "@/components/ui/field";
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
	return (
		<ActionModal
			trigger="Create network"
			triggerIcon={Plus}
			title="Create network"
			description="Create a new Docker network for container communication."
			icon={Network}
		>
			<form action={action} className="space-y-4">
				<input type="hidden" name="environmentId" value={environmentId} />
				<Field>
					<FieldLabel htmlFor="modal-network-name">Network name</FieldLabel>
					<Input id="modal-network-name" name="name" required placeholder="app-network" />
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
				<div className="flex justify-end gap-2 pt-2">
					<FormSubmitButton label="Create network" pendingLabel="Creating..." />
				</div>
			</form>
		</ActionModal>
	);
}
