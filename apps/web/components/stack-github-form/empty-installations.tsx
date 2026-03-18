import { ArrowUpRight, Github, Settings } from "lucide-react";
import type { GitHubProviderOption } from "@/components/github-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";

export function StackGitHubEmptyInstallations({
	appConfigured,
	providerOptions,
	installationStateMessage,
}: {
	appConfigured: boolean;
	providerOptions: GitHubProviderOption[];
	installationStateMessage: string;
}) {
	if (!appConfigured) {
		return (
			<EmptyState
				title="Connect GitHub to get started"
				description="Create a GitHub App in Settings to enable repository-based stack deployments."
				actions={
					<LinkButton href="/dashboard/settings/github" size="sm">
						<Settings className="h-3.5 w-3.5" />
						Set up GitHub
					</LinkButton>
				}
				className="bg-surface-raised"
			>
				<div className="mx-auto mt-3 flex items-center justify-center gap-2 text-muted">
					<Github className="h-4 w-4" />
					<span className="text-xs">No GitHub App configured</span>
				</div>
			</EmptyState>
		);
	}

	return (
		<EmptyState
			title="Install your GitHub App"
			description="Your GitHub App is ready but needs to be installed on a GitHub account or organization."
			actions={
				<>
					{providerOptions[0] ? (
						<Button
							size="sm"
							onClick={() => {
								window.location.href = `/api/github/install?providerId=${encodeURIComponent(providerOptions[0].id)}&redirectTo=${encodeURIComponent("/dashboard/settings/github")}`;
							}}
						>
							<ArrowUpRight className="h-3.5 w-3.5" />
							Install on GitHub
						</Button>
					) : null}
					<LinkButton href="/dashboard/settings/github" size="sm" variant="outline">
						Manage GitHub Apps
					</LinkButton>
				</>
			}
			className="bg-surface-raised"
		>
			{providerOptions.length ? (
				<div className="mt-3 flex flex-wrap justify-center gap-2">
					{providerOptions.map((provider) => (
						<Badge key={provider.id} variant="accent">
							{provider.name}
						</Badge>
					))}
				</div>
			) : null}
			{installationStateMessage ? (
				<p className="mt-2 text-xs text-muted">{installationStateMessage}</p>
			) : null}
		</EmptyState>
	);
}
