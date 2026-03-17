"use client";

import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { CodeEditor } from "@/components/code-editor";

type CodeEditorLanguage = "yaml" | "env";

export function ResizableEditorPanels({
	leftLabel,
	rightLabel,
	leftValue,
	rightValue,
	onLeftChange,
	onRightChange,
	leftLanguage = "yaml",
	rightLanguage = "env",
	leftPlaceholder,
	rightPlaceholder,
	height = "min(70vh, 800px)",
	defaultLeftSize = 70,
	minLeftSize = 25,
	minRightSize = 20,
	leftReadOnly,
	rightReadOnly,
}: {
	leftLabel: string;
	rightLabel: string;
	leftValue: string;
	rightValue: string;
	onLeftChange?: (value: string) => void;
	onRightChange?: (value: string) => void;
	leftLanguage?: CodeEditorLanguage;
	rightLanguage?: CodeEditorLanguage;
	leftPlaceholder?: string;
	rightPlaceholder?: string;
	height?: string;
	defaultLeftSize?: number;
	minLeftSize?: number;
	minRightSize?: number;
	leftReadOnly?: boolean;
	rightReadOnly?: boolean;
}) {
	return (
		<div className="overflow-hidden rounded-lg border border-default/8">
			<Group orientation="horizontal" className="min-h-0">
				<Panel defaultSize={defaultLeftSize} minSize={minLeftSize}>
					<div className="flex h-full flex-col">
						<div className="border-b border-default/5 bg-foreground/[0.02] px-3 py-1.5">
							<p className="text-[11px] font-medium text-muted">{leftLabel}</p>
						</div>
						<div className="min-h-0 flex-1">
							<CodeEditor
								value={leftValue}
								onChange={onLeftChange}
								language={leftLanguage}
								minHeight="280px"
								maxHeight={height}
								height={height}
								placeholder={leftPlaceholder}
								readOnly={leftReadOnly}
							/>
						</div>
					</div>
				</Panel>

				<Separator className="group relative flex w-1.5 items-center justify-center bg-default/8 transition-colors hover:bg-accent/20 active:bg-accent/30 data-[resize-handle-active]:bg-accent/30 cursor-col-resize">
					<div className="absolute z-10 flex h-8 w-4 items-center justify-center rounded-sm bg-surface-raised opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-active:opacity-100 group-data-[resize-handle-active]:opacity-100">
						<GripVertical className="h-3 w-3 text-muted" />
					</div>
				</Separator>

				<Panel
					defaultSize={100 - defaultLeftSize}
					minSize={minRightSize}
				>
					<div className="flex h-full flex-col">
						<div className="border-b border-default/5 bg-foreground/[0.02] px-3 py-1.5">
							<p className="text-[11px] font-medium text-muted">{rightLabel}</p>
						</div>
						<div className="min-h-0 flex-1">
							<CodeEditor
								value={rightValue}
								onChange={onRightChange}
								language={rightLanguage}
								minHeight="280px"
								maxHeight={height}
								height={height}
								placeholder={rightPlaceholder}
								readOnly={rightReadOnly}
							/>
						</div>
					</div>
				</Panel>
			</Group>
		</div>
	);
}
