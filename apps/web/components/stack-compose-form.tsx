"use client";

import { useState } from "react";
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

	return (
		<form
			action={action}
			className="overflow-hidden rounded-2xl border border-default/15 bg-surface"
		>
			<input type="hidden" name="projectId" value={projectId} />
			<div className="border-b border-default/15 px-5 py-4">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-end">
					<div className="flex-1 space-y-1.5">
						<label htmlFor="stack-name" className="text-sm font-medium">
							Stack name
						</label>
						<input
							id="stack-name"
							name="name"
							required
							value={stackName}
							onChange={(event) => setStackName(event.target.value)}
							placeholder="my-stack"
							className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						/>
					</div>
					<div className="min-w-[220px] space-y-1.5">
						<label htmlFor="environmentId" className="text-sm font-medium">
							Target environment
						</label>
						<select
							id="environmentId"
							name="environmentId"
							required
							className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						>
							{environments.map((environment) => (
								<option key={environment.id} value={environment.id}>
									{environment.name} ({environment.kind})
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="mt-4 space-y-1.5">
					<label htmlFor="stack-description" className="text-sm font-medium">
						Description
					</label>
					<input
						id="stack-description"
						name="description"
						placeholder="Frontend + API + worker"
						className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
					/>
				</div>
			</div>
			<div className="grid gap-0 xl:grid-cols-[1.45fr_0.8fr]">
				<div className="border-b border-default/15 xl:border-b-0 xl:border-r">
					<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
						<div>
							<p className="text-sm font-semibold">Compose file</p>
							<p className="text-xs text-muted">
								{stackName ? `${stackName}.compose.yaml` : "Enter a stack name above"}
							</p>
						</div>
					</div>
					<textarea
						id="composeYaml"
						name="composeYaml"
						required
						rows={22}
						defaultValue={`services:\n  app:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n    restart: unless-stopped\n`}
						className="min-h-[520px] w-full resize-none bg-[#050914] px-4 py-4 font-mono text-xs leading-6 text-white outline-none"
					/>
				</div>
				<div>
					<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
						<div>
							<p className="text-sm font-semibold">Env file</p>
							<p className="text-xs text-muted">
								{stackName ? `${stackName}.env` : "Optional environment variables"}
							</p>
						</div>
					</div>
					<textarea
						id="envFileContent"
						name="envFileContent"
						rows={22}
						placeholder={`APP_ENV=production\nAPP_PORT=8080`}
						className="min-h-[520px] w-full resize-none bg-background px-4 py-4 font-mono text-xs leading-6 outline-none"
					/>
				</div>
			</div>
			<div className="flex items-center justify-end gap-3 border-t border-default/15 px-5 py-4">
				<FormSubmitButton label="Create stack" pendingLabel="Creating stack..." />
			</div>
		</form>
	);
}
