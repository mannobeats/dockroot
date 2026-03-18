import type { GithubStatus, StatusSummary } from "@/components/github-apps-panel/types";

export function statusCopy(status: GithubStatus, error: string): StatusSummary | null {
	switch (status) {
		case "manifest-ready":
			return {
				tone: "accent",
				title: "GitHub App created",
				detail:
					"Install it on GitHub and Dockroot will pick up the new installation automatically.",
			};
		case "connected":
			return {
				tone: "success",
				title: "Installation detected",
				detail: "Your GitHub installation is connected and ready to use for new tracked stacks.",
			};
		case "manifest-error":
			return {
				tone: "danger",
				title: "GitHub setup failed",
				detail: error || "Something went wrong while creating the GitHub App manifest.",
			};
		case "provider-missing":
		case "missing":
		case "manifest-missing":
		case "denied":
		case "manifest-denied":
			return {
				tone: "warning",
				title: "GitHub setup needs attention",
				detail: error || "The GitHub flow did not complete cleanly. Try again from this panel.",
			};
		default:
			return null;
	}
}

export function formatUpdatedAt(value: string | Date) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Unknown";
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}
