"use client";

import { AlertCircle, CheckCircle2, Shield } from "lucide-react";
import type { StatusSummary } from "@/components/github-apps-panel/types";

export function GitHubAppsStatusBanner({
	summary,
	message,
}: {
	summary: StatusSummary | null;
	message: string;
}) {
	if (summary) {
		return (
			<div className="flex items-start gap-3 rounded-lg border border-default/10 bg-surface-raised px-4 py-3">
				<div className="mt-0.5">
					{summary.tone === "danger" ? (
						<AlertCircle className="h-4 w-4 text-danger" />
					) : summary.tone === "warning" ? (
						<Shield className="h-4 w-4 text-warning" />
					) : (
						<CheckCircle2 className="h-4 w-4 text-success" />
					)}
				</div>
				<div>
					<p className="text-sm font-semibold">{summary.title}</p>
					<p className="mt-0.5 text-xs text-muted">{message || summary.detail}</p>
				</div>
			</div>
		);
	}

	if (!message) {
		return null;
	}

	return (
		<div className="flex items-start gap-3 rounded-lg border border-default/10 bg-surface-raised px-4 py-3">
			<CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
			<p className="text-xs text-muted">{message}</p>
		</div>
	);
}
