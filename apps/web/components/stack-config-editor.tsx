"use client";

import { useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export function StackConfigEditor({
	stackId,
	composeFileName,
	envFileName,
	initialComposeYaml,
	initialEnvFileContent,
	editorHeight,
	action,
}: {
	stackId: string;
	composeFileName: string;
	envFileName?: string | null;
	initialComposeYaml: string;
	initialEnvFileContent?: string | null;
	editorHeight: string;
	action: (formData: FormData) => void | Promise<void>;
}) {
	const [composeYaml, setComposeYaml] = useState(initialComposeYaml);
	const [envFileContent, setEnvFileContent] = useState(initialEnvFileContent || "");

	return (
		<form action={action} className="space-y-3">
			<input type="hidden" name="stackId" value={stackId} />
			<input type="hidden" name="composeYaml" value={composeYaml} />
			<input type="hidden" name="envFileContent" value={envFileContent} />

			<div className="flex items-center justify-between rounded-lg border border-default/10 bg-surface px-3 py-2">
				<div>
					<p className="text-xs font-medium">Stack configuration</p>
					<p className="text-xs text-muted">Edit compose/env and save changes instantly.</p>
				</div>
				<div className="flex gap-2">
					<Button type="submit" name="mode" value="save" variant="secondary" size="sm">
						Save
					</Button>
					<Button type="submit" name="mode" value="redeploy" size="sm">
						Save + Redeploy
					</Button>
				</div>
			</div>

			<Panel className="grid gap-0 overflow-hidden xl:grid-cols-[1.4fr_0.6fr]">
				<div className="min-h-0 border-b border-default/10 xl:border-b-0 xl:border-r">
					<div className="border-b border-default/5 bg-surface px-4 py-2">
						<p className="text-xs font-medium">{composeFileName}</p>
					</div>
					<CodeEditor
						value={composeYaml}
						onChange={setComposeYaml}
						language="yaml"
						minHeight="320px"
						maxHeight={editorHeight}
						height={editorHeight}
					/>
				</div>
				<div className="min-h-0">
					<div className="border-b border-default/5 bg-surface px-4 py-2">
						<p className="text-xs font-medium">{envFileName || ".env"}</p>
					</div>
					<CodeEditor
						value={envFileContent}
						onChange={setEnvFileContent}
						language="env"
						minHeight="320px"
						maxHeight={editorHeight}
						height={editorHeight}
						placeholder="APP_ENV=production"
					/>
				</div>
			</Panel>
		</form>
	);
}
