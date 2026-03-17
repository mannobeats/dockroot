"use client";

import { Globe, Plus } from "lucide-react";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { useCallback, useRef, useState } from "react";
import { ActionModal } from "@/components/action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type FormAction = (formData: FormData) => void | Promise<void>;

function validateAgentUrl(value: string) {
	const trimmed = value.trim();
	if (!trimmed) {
		return;
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error("Agent URL must be a valid absolute URL, like http://agent-host:9095.");
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error("Agent URL must use http or https.");
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.search ||
		parsed.hash ||
		parsed.pathname !== "/"
	) {
		throw new Error("Agent URL should only contain the host and port, without a path or query.");
	}
}

export function CreateEnvironmentModal({ action }: { action: FormAction }) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState("");
	const formRef = useRef<HTMLFormElement>(null);
	const resetForm = useCallback(() => {
		setError("");
		formRef.current?.reset();
	}, []);

	return (
		<ActionModal
			trigger="Create"
			triggerIcon={Plus}
			title="Create environment"
			description="Add a remote environment and deploy the Dockroot agent."
			icon={Globe}
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
						validateAgentUrl(String(formData.get("agentUrl") || ""));
						await action(formData);
						resetForm();
						setOpen(false);
					} catch (submitError) {
						if (isRedirectError(submitError)) {
							throw submitError;
						}
						setError(
							submitError instanceof Error ? submitError.message : "Unable to create environment.",
						);
					}
				}}
				className="space-y-4"
			>
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
					<FieldHint>
						Optional. If left empty, Dockroot will try to learn the agent address automatically when
						it registers.
					</FieldHint>
				</Field>
				{error ? <Alert variant="error">{error}</Alert> : null}
				<div className="flex justify-end gap-2 pt-2">
					<Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<FormSubmitButton label="Create environment" pendingLabel="Creating..." />
				</div>
			</form>
		</ActionModal>
	);
}
