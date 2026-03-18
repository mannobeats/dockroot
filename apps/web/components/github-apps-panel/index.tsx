"use client";

import { Github, Loader2, Plus, RefreshCw } from "lucide-react";
import { GitHubCreateAppForm } from "@/components/github-apps-panel/create-app-form";
import { GitHubProvidersList } from "@/components/github-apps-panel/providers-list";
import { GitHubAppsStatusBanner } from "@/components/github-apps-panel/status-banner";
import type { GithubStatus } from "@/components/github-apps-panel/types";
import { useGitHubAppsPanel } from "@/components/github-apps-panel/use-github-apps-panel";
import type { GitHubProviderOption, InstallationOption } from "@/components/github-types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Panel,
	PanelContent,
	PanelDescription,
	PanelHeader,
	PanelTitle,
} from "@/components/ui/panel";

interface GitHubAppsPanelProps {
	initialProviders: GitHubProviderOption[];
	initialInstallations: InstallationOption[];
	redirectTo: string;
	initialStatus?: GithubStatus;
	initialError?: string;
}

export function GitHubAppsPanel({
	initialProviders,
	initialInstallations,
	redirectTo,
	initialStatus = "",
	initialError = "",
}: GitHubAppsPanelProps) {
	const {
		groupedProviders,
		manifestName,
		manifestOwner,
		manifestError,
		message,
		isRefreshing,
		pendingProviderId,
		showCreateForm,
		pollState,
		statusSummary,
		setShowCreateForm,
		setManifestName,
		setManifestOwner,
		refreshData,
		startManifestFlow,
		beginInstall,
		deleteProvider,
	} = useGitHubAppsPanel({
		initialProviders,
		initialInstallations,
		redirectTo,
		initialStatus,
		initialError,
	});

	return (
		<Panel tone="subtle" className="overflow-hidden">
			<PanelHeader className="border-b border-default/10">
				<div className="flex items-center gap-2">
					<div className="rounded-lg border border-default/12 bg-surface-raised p-2">
						<Github className="h-4 w-4" />
					</div>
					<div>
						<PanelTitle>GitHub Apps</PanelTitle>
						<PanelDescription>
							Manage GitHub App integrations for tracked stack deployments.
						</PanelDescription>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{pollState === "waiting" ? (
						<div className="hidden items-center gap-2 rounded-full border border-accent/15 bg-accent/6 px-3 py-1 text-[11px] font-medium text-accent sm:inline-flex">
							<Loader2 className="h-3 w-3 animate-spin" />
							Waiting for GitHub
						</div>
					) : null}
					{groupedProviders.length ? (
						<Button
							variant="ghost"
							size="xs"
							onClick={() => setShowCreateForm(!showCreateForm)}
							title="Register a new GitHub App"
						>
							<Plus className="h-3.5 w-3.5" />
						</Button>
					) : null}
					<Button
						variant="outline"
						size="sm"
						onClick={() => void refreshData()}
						disabled={isRefreshing}
					>
						<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
						Refresh
					</Button>
				</div>
			</PanelHeader>

			<PanelContent className="space-y-4">
				<GitHubAppsStatusBanner summary={statusSummary} message={message} />

				{showCreateForm && groupedProviders.length ? (
					<div className="rounded-lg border border-default/10 bg-surface-raised p-4">
						<p className="mb-3 text-xs font-semibold">Register a new GitHub App</p>
						<GitHubCreateAppForm
							manifestName={manifestName}
							manifestOwner={manifestOwner}
							manifestError={manifestError}
							onManifestNameChange={setManifestName}
							onManifestOwnerChange={setManifestOwner}
							onSubmit={startManifestFlow}
						/>
					</div>
				) : null}

				{groupedProviders.length ? (
					<GitHubProvidersList
						groupedProviders={groupedProviders}
						pendingProviderId={pendingProviderId}
						isRefreshing={isRefreshing}
						onBeginInstall={beginInstall}
						onRefresh={() => void refreshData()}
						onDeleteProvider={(providerId) => void deleteProvider(providerId)}
					/>
				) : (
					<div className="space-y-5">
						<EmptyState
							title="No GitHub Apps configured"
							description="Register a GitHub App to enable repository-based deployments with automatic sync."
							className="border-default/10 bg-surface-raised"
						/>
						<div className="rounded-lg border border-default/10 bg-surface-raised p-4">
							<p className="mb-3 text-xs font-semibold">Create your first GitHub App</p>
							<GitHubCreateAppForm
								manifestName={manifestName}
								manifestOwner={manifestOwner}
								manifestError={manifestError}
								onManifestNameChange={setManifestName}
								onManifestOwnerChange={setManifestOwner}
								onSubmit={startManifestFlow}
							/>
						</div>
					</div>
				)}
			</PanelContent>
		</Panel>
	);
}
