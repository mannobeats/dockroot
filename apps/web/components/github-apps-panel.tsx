"use client";

import {
	AlertCircle,
	ArrowUpRight,
	CheckCircle2,
	Github,
	Loader2,
	Plus,
	RefreshCw,
	Shield,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GitHubProviderOption, InstallationOption } from "@/components/github-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Panel,
	PanelContent,
	PanelDescription,
	PanelHeader,
	PanelTitle,
} from "@/components/ui/panel";

type GithubStatus =
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

function statusCopy(status: GithubStatus, error: string) {
	switch (status) {
		case "manifest-ready":
			return {
				tone: "accent" as const,
				title: "GitHub App created",
				detail:
					"Install it on GitHub and Dockroot will pick up the new installation automatically.",
			};
		case "connected":
			return {
				tone: "success" as const,
				title: "Installation detected",
				detail: "Your GitHub installation is connected and ready to use for new tracked stacks.",
			};
		case "manifest-error":
			return {
				tone: "danger" as const,
				title: "GitHub setup failed",
				detail: error || "Something went wrong while creating the GitHub App manifest.",
			};
		case "provider-missing":
		case "missing":
		case "manifest-missing":
		case "denied":
		case "manifest-denied":
			return {
				tone: "warning" as const,
				title: "GitHub setup needs attention",
				detail: error || "The GitHub flow did not complete cleanly. Try again from this panel.",
			};
		default:
			return null;
	}
}

function formatUpdatedAt(value: string | Date) {
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
	const [pollState, setPollState] = useState<"idle" | "waiting">(
		initialStatus === "manifest-ready" || initialStatus === "connected" ? "waiting" : "idle",
	);

	const groupedProviders = useMemo(() => {
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
			<PanelHeader className="border-b border-default/10 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_6%,transparent),transparent_55%)]">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<div className="rounded-lg border border-default/12 bg-surface-raised p-2">
							<Github className="h-4 w-4" />
						</div>
						<div>
							<PanelTitle>GitHub Apps</PanelTitle>
							<PanelDescription>
								Create apps, see every installation clearly, and keep GitHub access healthy before
								you create tracked stacks.
							</PanelDescription>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{pollState === "waiting" ? (
						<div className="hidden items-center gap-2 rounded-full border border-accent/15 bg-accent/6 px-3 py-1 text-[11px] font-medium text-accent sm:inline-flex">
							<Loader2 className="h-3 w-3 animate-spin" />
							Waiting for GitHub
						</div>
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

			<PanelContent className="space-y-5">
				<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
					<div className="rounded-2xl border border-default/10 bg-surface-raised px-4 py-3">
						<div className="flex items-start gap-3">
							<div className="mt-0.5">
								{statusSummary?.tone === "danger" ? (
									<AlertCircle className="h-4 w-4 text-danger" />
								) : statusSummary?.tone === "warning" ? (
									<Shield className="h-4 w-4 text-warning" />
								) : (
									<CheckCircle2 className="h-4 w-4 text-success" />
								)}
							</div>
							<div>
								<p className="text-sm font-semibold">
									{statusSummary?.title || "GitHub access workspace"}
								</p>
								<p className="mt-1 text-xs text-muted">
									{message ||
										"Create apps, install them on GitHub, and keep every account-level installation visible in one place."}
								</p>
							</div>
						</div>
					</div>
					<div className="rounded-2xl border border-default/10 bg-surface-raised p-4">
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
							Create a New App
						</p>
						<div className="mt-3 grid gap-3">
							<label className="grid gap-1">
								<span className="text-xs font-medium">App name</span>
								<input
									className="h-9 rounded-lg border border-default/12 bg-surface px-3 text-sm outline-none transition focus:border-accent/40"
									value={manifestName}
									onChange={(event) => setManifestName(event.target.value)}
									placeholder="Dockroot GitHub App"
								/>
							</label>
							<label className="grid gap-1">
								<span className="text-xs font-medium">Organization (optional)</span>
								<input
									className="h-9 rounded-lg border border-default/12 bg-surface px-3 text-sm outline-none transition focus:border-accent/40"
									value={manifestOwner}
									onChange={(event) => setManifestOwner(event.target.value)}
									placeholder="my-org"
								/>
							</label>
							{manifestError ? <p className="text-xs text-danger">{manifestError}</p> : null}
							<Button size="sm" onClick={startManifestFlow}>
								<Plus className="h-3.5 w-3.5" />
								Create GitHub App
							</Button>
						</div>
					</div>
				</div>

				{groupedProviders.length ? (
					<div className="grid gap-4">
						{groupedProviders.map(
							({ provider, installations: providerInstallations, repositoryCount, hasErrors }) => {
								const installCount = providerInstallations.length;
								const removing = pendingProviderId === provider.id;
								return (
									<div
										key={provider.id}
										className="rounded-2xl border border-default/12 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_82%,var(--accent)_2%),var(--surface-raised))]"
									>
										<div className="flex flex-col gap-4 border-b border-default/8 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
											<div className="space-y-2">
												<div className="flex flex-wrap items-center gap-2">
													<p className="text-base font-semibold tracking-tight">{provider.name}</p>
													<Badge
														variant={installCount ? (hasErrors ? "warning" : "success") : "default"}
													>
														{installCount
															? `${installCount} install${installCount === 1 ? "" : "s"}`
															: "Not installed"}
													</Badge>
													<Badge variant="accent">{repositoryCount} repos</Badge>
												</div>
												<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
													<span>Slug: {provider.appSlug}</span>
													<span>App ID: {provider.githubAppId}</span>
													<span>Updated {formatUpdatedAt(provider.updatedAt)}</span>
												</div>
											</div>
											<div className="flex flex-wrap items-center gap-2">
												<Button
													size="sm"
													variant={installCount ? "secondary" : "primary"}
													onClick={() => beginInstall(provider.id)}
													disabled={Boolean(pendingProviderId)}
												>
													<ArrowUpRight className="h-3.5 w-3.5" />
													{installCount ? "Add installation" : "Install on GitHub"}
												</Button>
												<Button
													size="sm"
													variant="outline"
													onClick={() => void refreshData()}
													disabled={isRefreshing || Boolean(pendingProviderId)}
												>
													<RefreshCw
														className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
													/>
													Sync
												</Button>
												<Button
													size="sm"
													variant="quietDanger"
													onClick={() => void deleteProvider(provider.id)}
													disabled={Boolean(pendingProviderId)}
												>
													{removing ? (
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
													) : (
														<Trash2 className="h-3.5 w-3.5" />
													)}
													Remove
												</Button>
											</div>
										</div>

										<div className="p-4">
											{providerInstallations.length ? (
												<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
													{providerInstallations.map((installation) => (
														<div
															key={installation.id}
															className="rounded-xl border border-default/10 bg-surface px-3 py-3"
														>
															<div className="flex items-start justify-between gap-3">
																<div>
																	<p className="text-sm font-semibold">
																		{installation.accountLogin}
																	</p>
																	<p className="mt-0.5 text-xs text-muted">
																		{installation.accountType || "GitHub account"}
																	</p>
																</div>
																<Badge
																	variant={installation.repositoryError ? "warning" : "success"}
																>
																	{installation.repositoryError ? "Needs sync" : "Healthy"}
																</Badge>
															</div>
															<div className="mt-4 flex flex-wrap items-center gap-2">
																<Badge>{installation.repositories.length} repositories</Badge>
																{installation.appSlug ? (
																	<Badge variant="accent">{installation.appSlug}</Badge>
																) : null}
															</div>
															{installation.repositories.length ? (
																<p className="mt-3 text-xs text-muted">
																	Includes{" "}
																	{installation.repositories
																		.slice(0, 3)
																		.map((repo) => repo.full_name)
																		.join(", ")}
																	{installation.repositories.length > 3
																		? ` +${installation.repositories.length - 3} more`
																		: ""}
																</p>
															) : null}
															{installation.repositoryError ? (
																<p className="mt-3 text-xs text-warning">
																	{installation.repositoryError}
																</p>
															) : null}
														</div>
													))}
												</div>
											) : (
												<EmptyState
													title="No installations yet"
													description="This app exists, but it has not been installed on any GitHub account or organization."
													actions={
														<Button size="sm" onClick={() => beginInstall(provider.id)}>
															<ArrowUpRight className="h-3.5 w-3.5" />
															Install on GitHub
														</Button>
													}
													className="border-default/10 bg-surface-raised"
												/>
											)}
										</div>
									</div>
								);
							},
						)}
					</div>
				) : (
					<EmptyState
						title="No GitHub Apps configured"
						description="Create your first GitHub App here. Once it is installed, every installation will appear in this workspace automatically."
						actions={
							<Button size="sm" onClick={startManifestFlow}>
								<Plus className="h-3.5 w-3.5" />
								Create GitHub App
							</Button>
						}
						className="border-default/10 bg-surface-raised"
					/>
				)}
			</PanelContent>
		</Panel>
	);
}
