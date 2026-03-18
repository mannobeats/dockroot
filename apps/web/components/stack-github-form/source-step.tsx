"use client";

import { ArrowRight, Check, Search } from "lucide-react";
import type {
	GitHubProviderOption,
	InstallationOption,
	InstallationRepository,
} from "@/components/github-types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dropdown,
	DropdownItem,
	DropdownLabel,
	DropdownMenu,
	DropdownTrigger,
} from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";

export function StackGitHubSourceStep({
	stepIndicator,
	activeInstallation,
	installationOptions,
	installationId,
	providerOptions,
	repositoryQuery,
	filteredRepositories,
	repositoryId,
	canContinue,
	selectedRepository,
	onSelectInstallation,
	onRepositoryQueryChange,
	onSelectRepository,
	onContinue,
}: {
	stepIndicator: React.ReactNode;
	activeInstallation?: InstallationOption;
	installationOptions: InstallationOption[];
	installationId: string;
	providerOptions: GitHubProviderOption[];
	repositoryQuery: string;
	filteredRepositories: InstallationRepository[];
	repositoryId: string;
	canContinue: boolean;
	selectedRepository?: InstallationRepository;
	onSelectInstallation: (installationId: string) => void;
	onRepositoryQueryChange: (value: string) => void;
	onSelectRepository: (repository: InstallationRepository) => void;
	onContinue: () => void;
}) {
	return (
		<div className="space-y-4">
			{stepIndicator}

			<div>
				<p className="mb-2 text-xs font-medium text-muted">Installation</p>
				<Dropdown>
					<DropdownTrigger size="md">
						{activeInstallation ? (
							<span className="flex items-center gap-2">
								<span className="font-medium">{activeInstallation.accountLogin}</span>
								<Badge variant="accent" className="text-[10px]">
									{activeInstallation.repositories.length} repos
								</Badge>
								{activeInstallation.repositoryError ? (
									<Badge variant="warning" className="text-[10px]">
										Needs sync
									</Badge>
								) : null}
							</span>
						) : undefined}
					</DropdownTrigger>
					<DropdownMenu>
						<DropdownLabel>GitHub Accounts</DropdownLabel>
						{installationOptions.map((installation) => {
							const providerName =
								providerOptions.find((provider) => provider.id === installation.providerId)?.name ||
								installation.appSlug ||
								"GitHub App";
							return (
								<DropdownItem
									key={installation.id}
									value={installation.id}
									selected={installationId === installation.id}
									onSelect={onSelectInstallation}
								>
									<div className="flex w-full items-center justify-between gap-2">
										<div className="min-w-0">
											<span className="font-medium">{installation.accountLogin}</span>
											<span className="ml-1.5 text-muted">{providerName}</span>
										</div>
										<Badge variant="accent" className="shrink-0 text-[10px]">
											{installation.repositories.length} repos
										</Badge>
									</div>
								</DropdownItem>
							);
						})}
					</DropdownMenu>
				</Dropdown>
			</div>

			<div>
				<p className="mb-2 text-xs font-medium text-muted">Repository</p>
				<div className="relative">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
					<Input
						value={repositoryQuery}
						onChange={(event) => onRepositoryQueryChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
							}
						}}
						placeholder="Filter repositories..."
						withIcon
						inputSize="sm"
						className="text-xs"
					/>
				</div>

				<div className="mt-1.5 max-h-72 overflow-auto rounded-lg border border-default/8">
					{filteredRepositories.length ? (
						filteredRepositories.map((repository) => {
							const active = String(repository.id) === repositoryId;
							return (
								<button
									key={repository.id}
									type="button"
									onClick={() => onSelectRepository(repository)}
									className={`flex w-full items-center justify-between border-b border-default/5 px-3 py-2 text-left text-xs last:border-b-0 transition-colors ${active ? "bg-accent/6 text-foreground" : "text-muted hover:bg-foreground/[0.02] hover:text-foreground"}`}
								>
									<div className="flex min-w-0 items-center gap-2">
										{active ? <Check className="h-3 w-3 shrink-0 text-accent" /> : null}
										<span className="truncate font-medium">{repository.full_name}</span>
									</div>
									<Badge
										variant={repository.private ? "warning" : "success"}
										className="text-[10px]"
									>
										{repository.private ? "private" : "public"}
									</Badge>
								</button>
							);
						})
					) : (
						<p className="px-3 py-4 text-center text-xs text-muted">No repositories match.</p>
					)}
				</div>

				{activeInstallation?.repositoryError ? (
					<Alert className="mt-2 text-xs">{activeInstallation.repositoryError}</Alert>
				) : null}
			</div>

			<div className="flex items-center justify-between border-t border-default/8 pt-4">
				<p className="text-xs text-muted">
					{selectedRepository?.full_name || "Select a repository to continue"}
				</p>
				<Button size="sm" disabled={!canContinue} onClick={onContinue}>
					Continue
					<ArrowRight className="h-3 w-3" />
				</Button>
			</div>
		</div>
	);
}
