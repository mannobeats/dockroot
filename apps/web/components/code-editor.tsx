"use client";

import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { EditorView } from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
import { useMemo } from "react";

type CodeEditorLanguage = "yaml" | "env";

export function CodeEditor({
	value,
	onChange,
	language,
	placeholder,
	readOnly = false,
	minHeight = "420px",
	maxHeight,
	height = "100%",
}: {
	value: string;
	onChange?: (value: string) => void;
	language: CodeEditorLanguage;
	placeholder?: string;
	readOnly?: boolean;
	minHeight?: string;
	maxHeight?: string;
	height?: string;
}) {
	const { resolvedTheme } = useTheme();

	const extensions = useMemo(() => {
		const baseExtension = language === "yaml" ? yaml() : StreamLanguage.define(properties);

		return [
			baseExtension,
			EditorView.lineWrapping,
			EditorView.theme({
				"&": {
					fontSize: "12px",
					height: "100%",
				},
				".cm-scroller": {
					fontFamily:
						"ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace",
					minHeight,
					maxHeight: maxHeight || "none",
					overflow: "auto",
				},
				".cm-content": {
					padding: "16px",
				},
				".cm-gutters": {
					borderRight: "1px solid color-mix(in srgb, var(--color-default) 12%, transparent)",
					backgroundColor: "transparent",
				},
			}),
		];
	}, [language, maxHeight, minHeight]);

	return (
		<CodeMirror
			value={value}
			height={height}
			theme={resolvedTheme === "light" ? githubLight : githubDark}
			extensions={extensions}
			editable={!readOnly}
			readOnly={readOnly}
			basicSetup={{
				autocompletion: true,
				bracketMatching: true,
				foldGutter: true,
				highlightActiveLine: !readOnly,
				highlightActiveLineGutter: !readOnly,
				lineNumbers: true,
			}}
			placeholder={placeholder}
			onChange={onChange}
		/>
	);
}
