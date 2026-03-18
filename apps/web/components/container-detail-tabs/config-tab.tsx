import { CodeEditor } from "@/components/code-editor";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";

interface ConfigTabProps {
	sortedEnv: string[];
	labels: Record<string, string>;
	editorHeight: string;
}

export function ConfigTab({ sortedEnv, labels, editorHeight }: ConfigTabProps) {
	return (
		<div className="grid gap-4 xl:grid-cols-2">
			<Panel className="overflow-hidden">
				<PanelHeader>
					<PanelTitle>Environment variables</PanelTitle>
				</PanelHeader>
				<CodeEditor
					value={sortedEnv.join("\n")}
					language="env"
					readOnly
					minHeight="420px"
					maxHeight={editorHeight}
					height={editorHeight}
				/>
			</Panel>
			<Panel className="overflow-hidden">
				<PanelHeader>
					<PanelTitle>Labels</PanelTitle>
				</PanelHeader>
				<CodeEditor
					value={JSON.stringify(labels, null, 2)}
					language="env"
					readOnly
					minHeight="420px"
					maxHeight={editorHeight}
					height={editorHeight}
				/>
			</Panel>
		</div>
	);
}
