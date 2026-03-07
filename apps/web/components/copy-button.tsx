"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);

	return (
		<button
			type="button"
			onClick={async () => {
				await navigator.clipboard.writeText(value);
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
