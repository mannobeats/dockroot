"use client";

import { useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { FormSubmitButton } from "@/components/form-submit-button";
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

			<div className="grid gap-0 overflow-hidden rounded-lg border border-default/8 lg:grid-cols-[1.4fr_0.6fr]">
				<div className="min-h-0 border-b border-default/8 lg:border-b-0 lg:border-r">
					<div className="border-b border-default/5 bg-foreground/[0.02] px-3 py-1.5">
						<p className="text-[11px] font-medium text-muted">
							{stackName ? `${stackName}.compose.yaml` : "compose.yaml"}
						</p>
					</div>
					<CodeEditor
						value={composeYaml}
						onChange={setComposeYaml}
						language="yaml"
						minHeight="320px"
						maxHeight={editorHeight}
						height={editorHeight}
						placeholder="services:\n  app:\n    image: nginx:alpine"
					/>
				</div>
				<div className="min-h-0">
					<div className="border-b border-default/5 bg-foreground/[0.02] px-3 py-1.5">
						<p className="text-[11px] font-medium text-muted">
							{stackName ? `${stackName}.env` : ".env"}
						</p>
					</div>
					<CodeEditor
						value={envFileContent}
						onChange={setEnvFileContent}
						language="env"
						minHeight="320px"
						maxHeight={editorHeight}
						height={editorHeight}
						placeholder={"APP_ENV=production\nAPP_PORT=8080"}
					/>
				</div>
			</div>

			<div className="flex justify-end">
				<FormSubmitButton label="Create stack" pendingLabel="Creating..." size="sm" />
			</div>
		</form>
	);
}
