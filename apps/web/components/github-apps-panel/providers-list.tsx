"use client";

import { ArrowUpRight, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { formatUpdatedAt } from "@/components/github-apps-panel/status";
import type { GroupedProvider } from "@/components/github-apps-panel/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function GitHubProvidersList({
	groupedProviders,
	pendingProviderId,
	isRefreshing,
	onBeginInstall,
	onRefresh,
	onDeleteProvider,
}: {
	groupedProviders: GroupedProvider[];
	pendingProviderId: string;
	isRefreshing: boolean;
	onBeginInstall: (providerId: string) => void;
	onRefresh: () => void;
	onDeleteProvider: (providerId: string) => void;
}) {
	return (
		<div className="divide-y divide-default/8 overflow-hidden rounded-lg border border-default/10">
			{groupedProviders.map(
				({ provider, installations: providerInstallations, repositoryCount, hasErrors }) => {
					const installCount = providerInstallations.length;
					const removing = pendingProviderId === provider.id;
					return (
						<div key={provider.id} className="bg-surface-raised">
							<div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<p className="text-sm font-semibold">{provider.name}</p>
										<Badge variant={installCount ? (hasErrors ? "warning" : "success") : "default"}>
											{installCount
												? `${installCount} install${installCount === 1 ? "" : "s"}`
												: "Not installed"}
										</Badge>
										<Badge variant="accent">{repositoryCount} repos</Badge>
									</div>
									<p className="mt-0.5 text-xs text-muted">
										Updated {formatUpdatedAt(provider.updatedAt)}
									</p>
								</div>
								<div className="flex items-center gap-1.5">
									<Button
										size="xs"
										variant={installCount ? "outline" : "primary"}
										onClick={() => onBeginInstall(provider.id)}
										disabled={Boolean(pendingProviderId)}
									>
										<ArrowUpRight className="h-3 w-3" />
										{installCount ? "Add" : "Install"}
									</Button>
									<Button
										size="xs"
										variant="ghost"
										onClick={onRefresh}
										disabled={isRefreshing || Boolean(pendingProviderId)}
										title="Sync installations"
									>
										<RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
									</Button>
									<Button
										size="xs"
										variant="ghost"
										onClick={() => onDeleteProvider(provider.id)}
										disabled={Boolean(pendingProviderId)}
										title="Remove app"
										className="text-muted hover:text-danger"
									>
										{removing ? (
											<Loader2 className="h-3 w-3 animate-spin" />
										) : (
											<Trash2 className="h-3 w-3" />
										)}
									</Button>
								</div>
							</div>

							{providerInstallations.length ? (
								<div className="border-t border-default/6 bg-surface px-4 py-2.5">
									<div className="flex flex-wrap items-center gap-3">
										{providerInstallations.map((installation) => (
											<div key={installation.id} className="flex items-center gap-2 text-xs">
												<span className="font-medium">{installation.accountLogin}</span>
												<Badge variant={installation.repositoryError ? "warning" : "success"}>
													{installation.repositoryError ? "Needs sync" : "Healthy"}
												</Badge>
												<span className="text-muted">{installation.repositories.length} repos</span>
											</div>
										))}
									</div>
								</div>
							) : null}
						</div>
					);
				},
			)}
		</div>
	);
}
