"use client";

import { Download } from "lucide-react";
import { ActionModal } from "@/components/action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type FormAction = (formData: FormData) => void | Promise<void>;

export function PullImageModal({
	action,
	environmentId,
}: {
	action: FormAction;
	environmentId: string;
}) {
	return (
		<ActionModal
			trigger="Pull"
			triggerIcon={Download}
			title="Pull image"
			description="Pull a Docker image from a container registry."
			icon={Download}
		>
			<form action={action} className="space-y-4">
				<input type="hidden" name="environmentId" value={environmentId} />
				<Field>
					<FieldLabel htmlFor="modal-image-ref">Image reference</FieldLabel>
					<Input
						id="modal-image-ref"
						name="imageRef"
						required
						placeholder="ghcr.io/owner/image:tag"
					/>
					<p className="mt-1.5 text-[11px] text-muted">
						Full registry path including tag, e.g. <code className="text-foreground/60">nginx:latest</code> or <code className="text-foreground/60">ghcr.io/org/app:v2</code>
					</p>
				</Field>
				<div className="flex justify-end gap-2 pt-2">
					<FormSubmitButton label="Pull image" pendingLabel="Pulling..." />
				</div>
			</form>
		</ActionModal>
	);
}
