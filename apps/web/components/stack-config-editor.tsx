"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
	const initialEnv = initialEnvFileContent || "";
	const [composeYaml, setComposeYaml] = useState(initialComposeYaml);
	const [envFileContent, setEnvFileContent] = useState(initialEnv);
	const formRef = useRef<HTMLFormElement | null>(null);
	const saveButtonRef = useRef<HTMLButtonElement | null>(null);
	const saveRedeployButtonRef = useRef<HTMLButtonElement | null>(null);
	const isDirty = useMemo(
		() => composeYaml !== initialComposeYaml || envFileContent !== initialEnv,
		[composeYaml, envFileContent, initialComposeYaml, initialEnv],
	);

	useEffect(() => {
		function onBeforeUnload(event: BeforeUnloadEvent) {
			if (!isDirty) {
				return;
			}
			event.preventDefault();
			event.returnValue = "";
		}

		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [isDirty]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") {
				return;
			}

			const activeElement = document.activeElement;
			if (!activeElement || !formRef.current?.contains(activeElement)) {
				return;
			}

			event.preventDefault();
			const targetButton = event.shiftKey ? saveRedeployButtonRef.current : saveButtonRef.current;
			formRef.current.requestSubmit(targetButton || undefined);
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<form ref={formRef} action={action} className="space-y-3">
			<input type="hidden" name="stackId" value={stackId} />
			<input type="hidden" name="composeYaml" value={composeYaml} />
			<input type="hidden" name="envFileContent" value={envFileContent} />

			<div className="flex items-center justify-between rounded-lg border border-default/10 bg-surface px-3 py-2">
				<div>
					<p className="text-xs font-medium">Stack configuration</p>
					<p className="text-xs text-muted">
						Edit compose/env, then save or redeploy. Shortcuts: Cmd/Ctrl+S and Cmd/Ctrl+Shift+S.
					</p>
					<p
						className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
							isDirty ? "text-warning" : "text-success"
						}`}
					>
						<span className={`h-1.5 w-1.5 rounded-full ${isDirty ? "bg-warning" : "bg-success"}`} />
						{isDirty ? "Unsaved changes" : "All changes saved"}
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						ref={saveButtonRef}
						type="submit"
						name="mode"
						value="save"
						variant="secondary"
						size="sm"
						title="Cmd/Ctrl+S"
					>
						Save
					</Button>
					<Button
						ref={saveRedeployButtonRef}
						type="submit"
						name="mode"
						value="redeploy"
						size="sm"
						title="Cmd/Ctrl+Shift+S"
					>
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
