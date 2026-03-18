import type { GitHubProviderOption, InstallationOption } from "@/components/github-types";

export type GithubStatus =
	| ""
	| "manifest-ready"
	| "connected"
	| "manifest-missing"
	| "manifest-denied"
	| "manifest-error"
	| "provider-missing"
	| "missing"
	| "denied"
	| string;

export type StatusSummary = {
	tone: "accent" | "success" | "danger" | "warning";
	title: string;
	detail: string;
};

export type GroupedProvider = {
	provider: GitHubProviderOption;
	installations: InstallationOption[];
	repositoryCount: number;
	hasErrors: boolean;
};
