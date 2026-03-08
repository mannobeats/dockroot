"use client";

import { useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { FormSubmitButton } from "@/components/form-submit-button";

export function StackComposeForm({
	projectId,
	environments,
	action,
}: {
	projectId: string;
	environments: Array<{ id: string; name: string; kind: string }>;
	action: (formData: FormData) => void | Promise<void>;
}) {
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
				<div className="space-y-1">
					<label htmlFor="stack-name" className="text-xs text-muted">
						Stack name
					</label>
					<input
						id="stack-name"
						name="name"
						required
						value={stackName}
						onChange={(event) => setStackName(event.target.value)}
						placeholder="my-stack"
						className="h-9 w-full rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
					/>
				</div>
				<div className="space-y-1">
					<label htmlFor="environmentId" className="text-xs text-muted">
						Target environment
					</label>
					<select
						id="environmentId"
						name="environmentId"
						required
						className="h-9 w-full rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors focus:border-foreground/20"
					>
						{environments.map((environment) => (
							<option key={environment.id} value={environment.id}>
								{environment.name} ({environment.kind})
							</option>
						))}
					</select>
				</div>
			</div>

			<div className="space-y-1">
				<label htmlFor="stack-description" className="text-xs text-muted">
					Description
				</label>
				<input
					id="stack-description"
					name="description"
					placeholder="Frontend + API + worker"
					className="h-9 w-full rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
				/>
			</div>

			<div className="grid gap-0 overflow-hidden rounded-xl border border-default/10 xl:grid-cols-[1.4fr_0.6fr]">
				<div className="border-b border-default/10 xl:border-b-0 xl:border-r">
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
						placeholder="services:\n  app:\n    image: nginx:alpine"
					/>
				</div>
				<div>
					<div className="border-b border-default/5 bg-surface px-4 py-2">
						<p className="text-xs font-medium">{stackName ? `${stackName}.env` : ".env"}</p>
					</div>
					<CodeEditor
						value={envFileContent}
						onChange={setEnvFileContent}
						language="env"
						minHeight="360px"
						placeholder={"APP_ENV=production\nAPP_PORT=8080"}
					/>
				</div>
			</div>

			<div className="flex justify-end">
				<FormSubmitButton
					label="Create stack"
					pendingLabel="Creating..."
					className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
				/>
			</div>
		</form>
	);
}
