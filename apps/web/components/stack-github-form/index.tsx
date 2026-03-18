"use client";

import { ArrowRight, Check, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { GitHubProviderOption, InstallationOption } from "@/components/github-types";
import { StackGitHubConfigureForm } from "@/components/stack-github-form/configure-form";
import { StackGitHubEmptyInstallations } from "@/components/stack-github-form/empty-installations";
import { StackGitHubStepIndicator } from "@/components/stack-github-form/step-indicator";
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

type WizardStep = "source" | "configure";

export function StackGitHubForm({
	environments,
	defaultEnvironmentId,
	installations,
	providers,
	appConfigured,
	action,
}: {
	environments: Array<{ id: string; name: string; kind: string }>;
	defaultEnvironmentId?: string;
	installations: InstallationOption[];
	providers: GitHubProviderOption[];
	appConfigured: boolean;
	action: (formData: FormData) => void | Promise<void>;
}) {
	const editorHeight = "min(70vh, 800px)";
	const [step, setStep] = useState<WizardStep>("source");
	const [installationOptions, setInstallationOptions] = useState(installations);
	const [_installationState, setInstallationState] = useState<
		"idle" | "refreshing" | "ready" | "error"
	>(installations.length ? "ready" : "idle");
	const [installationStateMessage, setInstallationStateMessage] = useState("");
	const [providerOptions, setProviderOptions] = useState(providers);
	const [installationId, setInstallationId] = useState(installations[0]?.id || "");
	const [repositoryQuery, setRepositoryQuery] = useState("");
	const [repositoryId, setRepositoryId] = useState("");
	const [stackName, setStackName] = useState("");
	const [description, setDescription] = useState("");
	const [branch, setBranch] = useState("main");
	const [composePath, setComposePath] = useState("compose.yaml");
	const [envPath, setEnvPath] = useState("");
	const [composeYaml, setComposeYaml] = useState("");
	const [envFileContent, setEnvFileContent] = useState("");
	const [autoDeployEnabled, setAutoDeployEnabled] = useState(true);
	const [autoDeployPaths, setAutoDeployPaths] = useState("");
	const [loadError, setLoadError] = useState("");
	const [pathSuggestions, setPathSuggestions] = useState<string[]>([]);
	const [headSha, setHeadSha] = useState("");
	const [isLoaded, setIsLoaded] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [showEditor, setShowEditor] = useState(true);

	const activeInstallation = installationOptions.find(
		(installation) => installation.id === installationId,
	);
	const repositories = activeInstallation?.repositories || [];
	const filteredRepositories = useMemo(() => {
		if (!repositoryQuery.trim()) {
			return repositories;
		}

		const query = repositoryQuery.toLowerCase();
		return repositories.filter(
			(repository) =>
				repository.full_name.toLowerCase().includes(query) ||
				repository.name.toLowerCase().includes(query),
		);
	}, [repositories, repositoryQuery]);
	const selectedRepository = repositories.find(
		(repository) => String(repository.id) === repositoryId,
	);
	const canContinue = Boolean(installationId && selectedRepository);
	const canCreateStack = Boolean(
		installationId &&
			selectedRepository?.owner.login &&
			selectedRepository?.name &&
			branch.trim() &&
			composePath.trim(),
	);

	const refreshInstallations = useCallback(async () => {
		if (!appConfigured) {
			return;
		}

		setInstallationState("refreshing");
		setInstallationStateMessage("");

		try {
			const response = await fetch("/api/github/installations", {
				cache: "no-store",
			});
			const payload = (await response.json()) as {
				error?: string;
				installations?: InstallationOption[];
			};

			if (!response.ok) {
				throw new Error(payload.error || "Unable to refresh GitHub installations.");
			}

			const nextInstallations = payload.installations || [];
			setInstallationOptions(nextInstallations);
			setInstallationId((current) => {
				if (current && nextInstallations.some((installation) => installation.id === current)) {
					return current;
				}
				return nextInstallations[0]?.id || "";
			});
			setInstallationState("ready");
			setInstallationStateMessage(
				nextInstallations.length
					? "GitHub access refreshed."
					: "No GitHub App installations connected yet.",
			);
		} catch (error) {
			setInstallationState("error");
			setInstallationStateMessage(
				error instanceof Error ? error.message : "Unable to refresh GitHub installations.",
			);
		}
	}, [appConfigured]);

	const refreshProviders = useCallback(async () => {
		if (!appConfigured) {
			return;
		}

		try {
			const response = await fetch("/api/github/providers", {
				cache: "no-store",
			});
			const payload = (await response.json()) as {
				error?: string;
				providers?: GitHubProviderOption[];
			};
			if (!response.ok) {
				throw new Error(payload.error || "Unable to refresh GitHub Apps.");
			}

			const nextProviders = payload.providers || [];
			setProviderOptions(nextProviders);
		} catch {
			// keep existing provider state on transient failures
		}
	}, [appConfigured]);

	async function loadRepositoryFiles(nextComposePath?: string) {
		if (!selectedRepository || !installationId || !branch || !(nextComposePath || composePath)) {
			return;
		}

		const resolvedComposePath = (nextComposePath || composePath).trim();

		setLoadError("");
		startTransition(async () => {
			try {
				const params = new URLSearchParams({
					installationId,
					owner: selectedRepository.owner.login,
					repository: selectedRepository.name,
					branch,
					composePath: resolvedComposePath,
				});

				if (envPath.trim()) {
					params.set("envPath", envPath.trim());
				}

				const response = await fetch(`/api/github/file?${params.toString()}`, {
					cache: "no-store",
				});
				const payload = (await response.json()) as {
					composeYaml?: string;
					envFileContent?: string;
					headSha?: string;
					error?: string;
				};

				if (!response.ok) {
					throw new Error(payload.error || "Unable to load repository files.");
				}

				setComposePath(resolvedComposePath);
				setComposeYaml(payload.composeYaml || "");
				setEnvFileContent(payload.envFileContent || "");
				setHeadSha(payload.headSha || "");
				setIsLoaded(true);
				setShowEditor(true);
			} catch (error) {
				setLoadError(error instanceof Error ? error.message : "Unable to load repository files.");
				setIsLoaded(false);
			}
		});
	}

	useEffect(() => {
		setInstallationOptions(installations);
		setInstallationId((current) => current || installations[0]?.id || "");
	}, [installations]);

	useEffect(() => {
		setProviderOptions(providers);
	}, [providers]);

	useEffect(() => {
		void refreshProviders();
		void refreshInstallations();
	}, [refreshInstallations, refreshProviders]);

	useEffect(() => {
		function refreshOnFocus() {
			void refreshProviders();
			void refreshInstallations();
		}

		window.addEventListener("focus", refreshOnFocus);
		document.addEventListener("visibilitychange", refreshOnFocus);

		return () => {
			window.removeEventListener("focus", refreshOnFocus);
			document.removeEventListener("visibilitychange", refreshOnFocus);
		};
	}, [refreshInstallations, refreshProviders]);

	useEffect(() => {
		const nextRepositoryId = repositories[0] ? String(repositories[0].id) : "";
		setRepositoryId((current) => {
			if (current && repositories.some((repository) => String(repository.id) === current)) {
				return current;
			}

			return nextRepositoryId;
		});
	}, [repositories]);

	useEffect(() => {
		if (!selectedRepository) {
			setStackName("");
			setBranch("main");
			setComposePath("");
			setComposeYaml("");
			setEnvFileContent("");
			setLoadError("");
			setHeadSha("");
			return;
		}

		setStackName((current) => current || selectedRepository.name);
		setBranch(selectedRepository.default_branch || "main");
		setComposePath("");
		setComposeYaml("");
		setEnvFileContent("");
		setHeadSha("");
		setLoadError("");
		setIsLoaded(false);
	}, [selectedRepository]);

	useEffect(() => {
		if (!selectedRepository || !installationId || !branch) {
			setPathSuggestions([]);
			return;
		}

		let cancelled = false;

		void (async () => {
			try {
				const params = new URLSearchParams({
					installationId,
					owner: selectedRepository.owner.login,
					repository: selectedRepository.name,
					branch,
				});
				const response = await fetch(`/api/github/compose-paths?${params.toString()}`, {
					cache: "no-store",
				});
				const payload = (await response.json()) as {
					suggestions?: string[];
				};

				if (!cancelled && response.ok) {
					const suggestions = payload.suggestions || [];
					setPathSuggestions(suggestions);
					if (!composePath && suggestions[0]) {
						setComposePath(suggestions[0]);
					}
				}
			} catch {
				if (!cancelled) {
					setPathSuggestions([]);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [branch, composePath, installationId, selectedRepository]);

	if (!installationOptions.length) {
		return (
			<StackGitHubEmptyInstallations
				appConfigured={appConfigured}
				providerOptions={providerOptions}
				installationStateMessage={installationStateMessage}
			/>
		);
	}

	const stepIndicator = (
		<StackGitHubStepIndicator
			step={step}
			canContinue={canContinue}
			onSetSource={() => setStep("source")}
			onSetConfigure={() => {
				if (canContinue) {
					setStep("configure");
				}
			}}
		/>
	);

	if (step === "source") {
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
									providerOptions.find((provider) => provider.id === installation.providerId)
										?.name ||
									installation.appSlug ||
									"GitHub App";
								return (
									<DropdownItem
										key={installation.id}
										value={installation.id}
										selected={installationId === installation.id}
										onSelect={(value) => {
											setInstallationId(value);
											setRepositoryQuery("");
											setRepositoryId("");
											setIsLoaded(false);
											setComposePath("");
											setComposeYaml("");
											setEnvFileContent("");
											setHeadSha("");
											setLoadError("");
										}}
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
							onChange={(event) => setRepositoryQuery(event.target.value)}
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
										onClick={() => {
											setRepositoryId(String(repository.id));
											setStackName(repository.name);
											setBranch(repository.default_branch || "main");
											setComposePath("");
											setComposeYaml("");
											setEnvFileContent("");
											setHeadSha("");
											setLoadError("");
											setIsLoaded(false);
										}}
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
					<Button size="sm" disabled={!canContinue} onClick={() => setStep("configure")}>
						Continue
						<ArrowRight className="h-3 w-3" />
					</Button>
				</div>
			</div>
		);
	}

	return (
		<StackGitHubConfigureForm
			action={action}
			installationId={installationId}
			repositoryId={repositoryId}
			selectedRepository={selectedRepository}
			stackName={stackName}
			description={description}
			branch={branch}
			composePath={composePath}
			envPath={envPath}
			composeYaml={composeYaml}
			envFileContent={envFileContent}
			autoDeployEnabled={autoDeployEnabled}
			autoDeployPaths={autoDeployPaths}
			stepIndicator={stepIndicator}
			isLoaded={isLoaded}
			headSha={headSha}
			environments={environments}
			defaultEnvironmentId={defaultEnvironmentId}
			pathSuggestions={pathSuggestions}
			loadRepositoryFiles={loadRepositoryFiles}
			isPending={isPending}
			loadError={loadError}
			showEditor={showEditor}
			setStackName={setStackName}
			setDescription={setDescription}
			setBranch={setBranch}
			setComposePath={setComposePath}
			setEnvPath={setEnvPath}
			setComposeYaml={setComposeYaml}
			setEnvFileContent={setEnvFileContent}
			setAutoDeployEnabled={setAutoDeployEnabled}
			setAutoDeployPaths={setAutoDeployPaths}
			setShowEditor={setShowEditor}
			setIsLoaded={setIsLoaded}
			setLoadError={setLoadError}
			onBack={() => setStep("source")}
			canCreateStack={canCreateStack}
			editorHeight={editorHeight}
		/>
	);
}
