"use client";

import { Globe, Plus } from "lucide-react";
import { ActionModal } from "@/components/action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type FormAction = (formData: FormData) => void | Promise<void>;

export function CreateEnvironmentModal({ action }: { action: FormAction }) {
	return (
		<ActionModal
			trigger="Create"
			triggerIcon={Plus}
			title="Create environment"
			description="Add a remote environment and deploy the Dockroot agent."
			icon={Globe}
		>
			<form action={action} className="space-y-4">
				<Field>
					<FieldLabel htmlFor="modal-env-name">Name</FieldLabel>
					<Input id="modal-env-name" name="name" required placeholder="prod-fra-01" />
				</Field>
				<Field>
					<FieldLabel htmlFor="modal-env-description">Description</FieldLabel>
					<Input
						id="modal-env-description"
						name="description"
						placeholder="Hetzner VM for production"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="modal-agent-url">Agent URL</FieldLabel>
					<Input id="modal-agent-url" name="agentUrl" placeholder="http://agent:9095" />
				</Field>
				<div className="flex justify-end gap-2 pt-2">
					<FormSubmitButton label="Create environment" pendingLabel="Creating..." />
				</div>
			</form>
		</ActionModal>
	);
}
