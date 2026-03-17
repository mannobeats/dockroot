"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ResizableEditorPanels } from "@/components/resizable-editor-panels";
import { Button } from "@/components/ui/button";

export function StackConfigEditor({
	stackId,
	composeFileName,
	envFileName,
	initialComposeYaml,
	initialEnvFileContent,
	editorHeight,
	action,
	disabled = false,
	disabledReason,
}: {
	stackId: string;
	composeFileName: string;
	envFileName?: string | null;
	initialComposeYaml: string;
	initialEnvFileContent?: string | null;
	editorHeight: string;
	action: (formData: FormData) => void | Promise<void>;
	disabled?: boolean;
	disabledReason?: string;
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
		<form ref={formRef} action={action} className="space-y-0">
			<input type="hidden" name="stackId" value={stackId} />
			<input type="hidden" name="composeYaml" value={composeYaml} />
			<input type="hidden" name="envFileContent" value={envFileContent} />

			{/* Toolbar */}
			<div className="flex items-center justify-between rounded-t-xl border border-b-0 border-default/10 bg-surface px-3 py-2">
				<div className="flex items-center gap-2">
					<span className={`h-1.5 w-1.5 rounded-full ${isDirty ? "bg-warning" : "bg-success"}`} />
					<span className="text-[11px] text-muted">{isDirty ? "Unsaved" : "Saved"}</span>
					{disabledReason ? (
						<span className="text-[11px] text-warning">{disabledReason}</span>
					) : null}
				</div>
				<div className="flex gap-1.5">
					<Button
						ref={saveButtonRef}
						type="submit"
						name="mode"
						value="save"
						variant="ghost"
						size="xs"
						title="Cmd/Ctrl+S"
						disabled={disabled}
					>
						Save
					</Button>
					<Button
						ref={saveRedeployButtonRef}
						type="submit"
						name="mode"
						value="redeploy"
						size="xs"
						title="Cmd/Ctrl+Shift+S"
						disabled={disabled}
					>
						Save + Redeploy
					</Button>
				</div>
			</div>

			{/* Editor */}
			<div className="rounded-b-xl border border-t-0 border-default/10">
				<ResizableEditorPanels
					leftLabel={composeFileName}
					rightLabel={envFileName || ".env"}
					leftValue={composeYaml}
					rightValue={envFileContent}
					onLeftChange={setComposeYaml}
					onRightChange={setEnvFileContent}
					leftLanguage="yaml"
					rightLanguage="env"
					rightPlaceholder="APP_ENV=production"
					height={editorHeight}
				/>
			</div>
		</form>
	);
}
