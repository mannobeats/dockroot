"use client";

import { useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";

export function StackComposeForm({
	projectId,
	environments,
	action,
}: {
	projectId: string;
	environments: Array<{ id: string; name: string; kind: string }>;
	action: (formData: FormData) => void | Promise<void>;
}) {
	const editorHeight = "min(60vh, 640px)";
	const [stackName, setStackName] = useState("");
	const [composeYaml, setComposeYaml] = useState(
		`services:\n  app:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n    restart: unless-stopped\n`,
	);
	const [envFileContent, setEnvFileContent] = useState("");

	return (
		<form action={action} className="space-y-4">
			<input type="hidden" name="projectId" value={projectId} />
			<input type="hidden" name="composeYaml" value={composeYaml} />
			<input type="hidden" name="envFileContent" value={envFileContent} />

			<div className="grid gap-3 sm:grid-cols-2">
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
					<FieldLabel htmlFor="environmentId">Target environment</FieldLabel>
					<Select id="environmentId" name="environmentId" required>
						{environments.map((environment) => (
							<option key={environment.id} value={environment.id}>
								{environment.name} ({environment.kind})
							</option>
						))}
					</Select>
				</Field>
			</div>

			<Field>
				<FieldLabel htmlFor="stack-description">Description</FieldLabel>
				<Input id="stack-description" name="description" placeholder="Frontend + API + worker" />
			</Field>

			<Panel className="grid gap-0 overflow-hidden xl:grid-cols-[1.4fr_0.6fr]">
				<div className="min-h-0 border-b border-default/10 xl:border-b-0 xl:border-r">
					<div className="border-b border-default/5 bg-surface px-4 py-2">
						<p className="text-xs font-medium">
							{stackName ? `${stackName}.compose.yaml` : "compose.yaml"}
						</p>
					</div>
					<CodeEditor
						value={composeYaml}
						onChange={setComposeYaml}
						language="yaml"
						minHeight="360px"
						maxHeight={editorHeight}
						height={editorHeight}
						placeholder="services:\n  app:\n    image: nginx:alpine"
					/>
				</div>
				<div className="min-h-0">
					<div className="border-b border-default/5 bg-surface px-4 py-2">
						<p className="text-xs font-medium">{stackName ? `${stackName}.env` : ".env"}</p>
					</div>
					<CodeEditor
						value={envFileContent}
						onChange={setEnvFileContent}
						language="env"
						minHeight="360px"
						maxHeight={editorHeight}
						height={editorHeight}
						placeholder={"APP_ENV=production\nAPP_PORT=8080"}
					/>
				</div>
			</Panel>

			<div className="flex justify-end">
				<FormSubmitButton label="Create stack" pendingLabel="Creating..." size="sm" />
			</div>
		</form>
	);
}
