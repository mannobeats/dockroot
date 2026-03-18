"use client";

import { Github, Loader2, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GitHubCreateAppForm } from "@/components/github-apps-panel/create-app-form";
import { GitHubProvidersList } from "@/components/github-apps-panel/providers-list";
import { statusCopy } from "@/components/github-apps-panel/status";
import { GitHubAppsStatusBanner } from "@/components/github-apps-panel/status-banner";
import type { GithubStatus, GroupedProvider } from "@/components/github-apps-panel/types";
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

export function GitHubAppsPanel({
	initialProviders,
	initialInstallations,
	redirectTo,
	initialStatus = "",
	initialError = "",
}: {
	initialProviders: GitHubProviderOption[];
	initialInstallations: InstallationOption[];
	redirectTo: string;
	initialStatus?: GithubStatus;
	initialError?: string;
}) {
	const router = useRouter();
	const [providers, setProviders] = useState(initialProviders);
	const [installations, setInstallations] = useState(initialInstallations);
	const [manifestName, setManifestName] = useState("Dockroot GitHub App");
	const [manifestOwner, setManifestOwner] = useState("");
	const [manifestError, setManifestError] = useState("");
	const [message, setMessage] = useState("");
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [pendingProviderId, setPendingProviderId] = useState("");
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [pollState, setPollState] = useState<"idle" | "waiting">(
		initialStatus === "manifest-ready" || initialStatus === "connected" ? "waiting" : "idle",
	);

	const groupedProviders = useMemo<GroupedProvider[]>(() => {
		return providers.map((provider) => {
			const providerInstallations = installations.filter(
				(installation) => (installation.providerId || "") === provider.id,
			);
			const repositoryCount = providerInstallations.reduce(
				(total, installation) => total + installation.repositories.length,
				0,
			);
			const hasErrors = providerInstallations.some((installation) => installation.repositoryError);

			return {
				provider,
				installations: providerInstallations,
				repositoryCount,
				hasErrors,
			};
		});
	}, [installations, providers]);

	const refreshData = useCallback(
		async (options?: { silent?: boolean }) => {
			if (!options?.silent) {
				setIsRefreshing(true);
				setMessage("");
			}

			try {
				const [providersResponse, installationsResponse] = await Promise.all([
					fetch("/api/github/providers", { cache: "no-store" }),
					fetch("/api/github/installations", { cache: "no-store" }),
				]);

				const providersPayload = (await providersResponse.json()) as {
					error?: string;
					providers?: GitHubProviderOption[];
				};
				const installationsPayload = (await installationsResponse.json()) as {
					error?: string;
					installations?: InstallationOption[];
				};

				if (!providersResponse.ok) {
					throw new Error(providersPayload.error || "Unable to refresh GitHub Apps.");
				}
				if (!installationsResponse.ok) {
					throw new Error(installationsPayload.error || "Unable to refresh GitHub installations.");
				}

				const nextProviders = providersPayload.providers || [];
				const nextInstallations = installationsPayload.installations || [];
				setProviders(nextProviders);
				setInstallations(nextInstallations);
				router.refresh();
				return {
					providers: nextProviders,
					installations: nextInstallations,
				};
			} catch (error) {
				setMessage(error instanceof Error ? error.message : "Unable to refresh GitHub Apps.");
				return null;
			} finally {
				if (!options?.silent) {
					setIsRefreshing(false);
				}
			}
		},
		[router],
	);

	useEffect(() => {
		setProviders(initialProviders);
	}, [initialProviders]);

	useEffect(() => {
		setInstallations(initialInstallations);
	}, [initialInstallations]);

	useEffect(() => {
		const summary = statusCopy(initialStatus, initialError);
		if (summary) {
			setMessage(summary.detail);
		}
	}, [initialError, initialStatus]);

	useEffect(() => {
		if (initialStatus !== "manifest-ready" && initialStatus !== "connected") {
			return;
		}

		let cancelled = false;
		let attempts = 0;

		const poll = async () => {
			if (cancelled) {
				return;
			}

			setPollState("waiting");
			const result = await refreshData({ silent: true });
			if (cancelled) {
				return;
			}

			const hasInstallations = Boolean(result?.installations?.length);
			if (initialStatus === "connected" || hasInstallations) {
				setPollState("idle");
				if (hasInstallations) {
					setMessage("GitHub installation detected and synced.");
				}
				return;
			}

			attempts += 1;
			if (attempts < 8) {
				window.setTimeout(poll, 1500);
			} else {
				setPollState("idle");
			}
		};

		void poll();

		return () => {
			cancelled = true;
		};
	}, [initialStatus, refreshData]);

	const startManifestFlow = useCallback(() => {
		const trimmedName = manifestName.trim();
		if (!trimmedName) {
			setManifestError("GitHub App name is required.");
			return;
		}

		setManifestError("");
		const params = new URLSearchParams({
			redirectTo,
			name: trimmedName,
		});
		const trimmedOwner = manifestOwner.trim();
		if (trimmedOwner) {
			params.set("owner", trimmedOwner);
		}
		window.location.href = `/api/github/app/manifest?${params.toString()}`;
	}, [manifestName, manifestOwner, redirectTo]);

	const beginInstall = useCallback(
		(providerId: string) => {
			setPendingProviderId(providerId);
			window.location.href = `/api/github/install?providerId=${encodeURIComponent(providerId)}&redirectTo=${encodeURIComponent(redirectTo)}`;
		},
		[redirectTo],
	);

	const deleteProvider = useCallback(
		async (providerId: string) => {
			setPendingProviderId(providerId);
			setMessage("");

			try {
				const response = await fetch(`/api/github/providers/${encodeURIComponent(providerId)}`, {
					method: "DELETE",
				});
				const payload = (await response.json()) as {
					error?: string;
					remoteUninstalled?: number;
					remoteFailures?: string[];
				};

				if (!response.ok) {
					throw new Error(payload.error || "Unable to remove GitHub App.");
				}

				await refreshData({ silent: true });
				if ((payload.remoteFailures || []).length) {
					setMessage(
						`App removed. ${payload.remoteUninstalled || 0} installations were cleaned up, but some uninstall calls failed.`,
					);
				} else {
					setMessage(
						`App removed. ${payload.remoteUninstalled || 0} installation${payload.remoteUninstalled === 1 ? "" : "s"} cleaned up.`,
					);
				}
			} catch (error) {
				setMessage(error instanceof Error ? error.message : "Unable to remove GitHub App.");
			} finally {
				setPendingProviderId("");
			}
		},
		[refreshData],
	);

	const statusSummary = statusCopy(initialStatus, initialError);

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
