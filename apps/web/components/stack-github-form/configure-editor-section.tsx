import { ChevronDown, ChevronRight } from "lucide-react";
import { ResizableEditorPanels } from "@/components/resizable-editor-panels";

export function StackGitHubConfigureEditorSection({
	showEditor,
	composePath,
	envPath,
	composeYaml,
	envFileContent,
	editorHeight,
	setShowEditor,
	setComposeYaml,
	setEnvFileContent,
}: {
	showEditor: boolean;
	composePath: string;
	envPath: string;
	composeYaml: string;
	envFileContent: string;
	editorHeight: string;
	setShowEditor: (value: boolean) => void;
	setComposeYaml: (value: string) => void;
	setEnvFileContent: (value: string) => void;
}) {
	return (
		<div>
			<button
				type="button"
				onClick={() => setShowEditor(!showEditor)}
				className="flex w-full items-center justify-between"
			>
				<p className="text-xs font-medium text-muted">Source preview</p>
				{showEditor ? (
					<ChevronDown className="h-3.5 w-3.5 text-muted" />
				) : (
					<ChevronRight className="h-3.5 w-3.5 text-muted" />
				)}
			</button>
			{showEditor ? (
				<div className="mt-3">
					<ResizableEditorPanels
						leftLabel={composePath || "compose.yaml"}
						rightLabel={envPath || ".env"}
						leftValue={composeYaml}
						rightValue={envFileContent}
						onLeftChange={setComposeYaml}
						onRightChange={setEnvFileContent}
						leftLanguage="yaml"
						rightLanguage="env"
						leftPlaceholder="Load a repository to populate this editor."
						rightPlaceholder="Optional env file."
						height={editorHeight}
					/>
				</div>
			) : null}
		</div>
	);
}
