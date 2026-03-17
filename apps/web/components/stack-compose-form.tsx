"use client";

import { useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { ResizableEditorPanels } from "@/components/resizable-editor-panels";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function StackComposeForm({
	environments,
	action,
}: {
	environments: Array<{ id: string; name: string; kind: string }>;
	action: (formData: FormData) => void | Promise<void>;
}) {
	const editorHeight = "min(70vh, 800px)";
	const [stackName, setStackName] = useState("");
	const [composeYaml, setComposeYaml] = useState(
		`services:\n  app:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n    restart: unless-stopped\n`,
	);
	const [envFileContent, setEnvFileContent] = useState("");

	return (
		<form action={action} className="space-y-4">
			<input type="hidden" name="composeYaml" value={composeYaml} />
			<input type="hidden" name="envFileContent" value={envFileContent} />

			<div className="grid gap-3 sm:grid-cols-3">
				<Field>
					<FieldLabel htmlFor="stack-name">Stack name</FieldLabel>
					<Input
						id="stack-name"
						name="name"
						required
						value={stackName}
						onChange={(event) => setStackName(event.target.value)}
						placeholder="my-stack"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="stack-description">Description</FieldLabel>
					<Input id="stack-description" name="description" placeholder="Frontend + API + worker" />
				</Field>
				<Field>
					<FieldLabel htmlFor="environmentId">Environment</FieldLabel>
					<Select id="environmentId" name="environmentId" required>
						{environments.map((environment) => (
							<option key={environment.id} value={environment.id}>
								{environment.name} ({environment.kind})
							</option>
						))}
					</Select>
				</Field>
			</div>

			<ResizableEditorPanels
				leftLabel={stackName ? `${stackName}.compose.yaml` : "compose.yaml"}
				rightLabel={stackName ? `${stackName}.env` : ".env"}
				leftValue={composeYaml}
				rightValue={envFileContent}
				onLeftChange={setComposeYaml}
				onRightChange={setEnvFileContent}
				leftLanguage="yaml"
				rightLanguage="env"
				leftPlaceholder="services:\n  app:\n    image: nginx:alpine"
				rightPlaceholder={"APP_ENV=production\nAPP_PORT=8080"}
				height={editorHeight}
			/>

			<div className="flex justify-end">
				<FormSubmitButton label="Create stack" pendingLabel="Creating..." size="sm" />
			</div>
		</form>
	);
}
