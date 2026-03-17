"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);

	async function writeToClipboard(text: string) {
		if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return;
		}

		if (typeof document === "undefined") {
			throw new Error("Clipboard is not available.");
		}

		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.setAttribute("readonly", "true");
		textarea.style.position = "absolute";
		textarea.style.left = "-9999px";
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand("copy");
		document.body.removeChild(textarea);
	}

	return (
		<button
			type="button"
			onClick={async () => {
				await writeToClipboard(value);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
			className="inline-flex h-9 items-center justify-center rounded-xl border border-default/20 bg-background px-3 text-sm text-muted transition-colors hover:text-foreground"
		>
			{copied ? <Check className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" />}
			{copied ? "Copied" : "Copy"}
		</button>
	);
}
