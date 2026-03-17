"use client";

import {
	ArrowLeft,
	ArrowRight,
	ArrowUpRight,
	Check,
	ChevronDown,
	ChevronRight,
	Github,
	GitBranch,
	Search,
	Settings,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { CodeEditor } from "@/components/code-editor";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { GitHubProviderOption, InstallationOption } from "@/components/github-types";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { Select } from "@/components/ui/select";

type WizardStep = "source" | "configure";

export function StackGitHubForm({
	environments,
	installations,
	providers,
	appConfigured,
	action,
}: {
	environments: Array<{ id: string; name: string; kind: string }>;
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

	/* ── No installations: guided setup flow ────────── */
	if (!installationOptions.length) {
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

	/* ── Step indicator ────────────────────────────── */
	const stepIndicator = (
		<div className="mb-4 flex items-center gap-2 text-xs text-muted">
			<button
				type="button"
				onClick={() => setStep("source")}
				className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
					step === "source"
						? "bg-foreground font-medium text-background shadow-sm"
						: "hover:text-foreground"
				}`}
			>
				<span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">
					{step === "configure" ? <Check className="h-2.5 w-2.5" /> : "1"}
				</span>
				Source
			</button>
			<ChevronRight className="h-3 w-3" />
			<button
				type="button"
				onClick={() => (canContinue ? setStep("configure") : undefined)}
				disabled={!canContinue}
				className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
					step === "configure"
						? "bg-foreground font-medium text-background shadow-sm"
						: canContinue
							? "hover:text-foreground"
							: "opacity-40"
				}`}
			>
				<span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">
					2
				</span>
				Configure
			</button>
		</div>
	);

	/* ── Step 1: Select source ────────────────────── */
	if (step === "source") {
		return (
			<div className="space-y-4">
				{stepIndicator}

				{/* Installation dropdown */}
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
									providerOptions.find((p) => p.id === installation.providerId)?.name ||
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

				{/* Repository selection */}
				<div>
					<p className="mb-2 text-xs font-medium text-muted">Repository</p>
					<div className="relative">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
						<Input
							value={repositoryQuery}
							onChange={(event) => setRepositoryQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") event.preventDefault();
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
											{active ? (
												<Check className="h-3 w-3 shrink-0 text-accent" />
											) : null}
											<span className="truncate font-medium">
												{repository.full_name}
											</span>
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
							<p className="px-3 py-4 text-center text-xs text-muted">
								No repositories match.
							</p>
						)}
					</div>

					{activeInstallation?.repositoryError ? (
						<Alert className="mt-2 text-xs">{activeInstallation.repositoryError}</Alert>
					) : null}
				</div>

				{/* Continue */}
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

	/* ── Step 2: Configure & deploy ───────────────── */
	return (
		<form action={action} className="space-y-4">
			<input type="hidden" name="installationId" value={installationId} />
			<input type="hidden" name="repositoryId" value={repositoryId} />
			<input type="hidden" name="owner" value={selectedRepository?.owner.login || ""} />
			<input type="hidden" name="repository" value={selectedRepository?.name || ""} />
			<input type="hidden" name="name" value={stackName} />
			<input type="hidden" name="description" value={description} />
			<input type="hidden" name="branch" value={branch} />
			<input type="hidden" name="composePath" value={composePath} />
			<input type="hidden" name="envPath" value={envPath} />
			<input type="hidden" name="composeYaml" value={composeYaml} />
			<input type="hidden" name="envFileContent" value={envFileContent} />
			<input type="hidden" name="autoDeployEnabled" value={autoDeployEnabled ? "true" : "false"} />
			<input type="hidden" name="autoDeployPaths" value={autoDeployPaths} />

			{stepIndicator}

			{/* Selected repo header */}
			<div className="flex items-center gap-2 rounded-lg border border-default/8 bg-surface-raised px-3 py-2">
				<Github className="h-3.5 w-3.5 text-muted" />
				<span className="text-xs font-medium">{selectedRepository?.full_name}</span>
				<Badge variant="accent" className="text-[10px]">
					<GitBranch className="mr-0.5 h-2.5 w-2.5" />
					{branch}
				</Badge>
				{isLoaded ? (
					<span className="inline-flex items-center gap-1 text-[10px] text-success">
						<Sparkles className="h-2.5 w-2.5" />
						{headSha?.slice(0, 8)}
					</span>
				) : null}
			</div>

			{/* Configuration */}
			<div className="grid gap-3 sm:grid-cols-2">
				<Field>
					<FieldLabel htmlFor="github-stack-name">Stack name</FieldLabel>
					<Input
						id="github-stack-name"
						value={stackName}
						onChange={(event) => setStackName(event.target.value)}
						placeholder="my-app"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="github-environment-id">Environment</FieldLabel>
					<Select id="github-environment-id" name="environmentId" required>
						{environments.map((environment) => (
							<option key={environment.id} value={environment.id}>
								{environment.name} ({environment.kind})
							</option>
						))}
					</Select>
				</Field>
			</div>

			<Field>
				<FieldLabel htmlFor="github-stack-description">Description</FieldLabel>
				<Input
					id="github-stack-description"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="Frontend + API + worker"
				/>
			</Field>

			<div className="grid gap-3 sm:grid-cols-3">
				<Field>
					<FieldLabel htmlFor="github-stack-branch">
						<GitBranch className="mr-1 inline h-3 w-3" />
						Branch
					</FieldLabel>
					<Input
						id="github-stack-branch"
						value={branch}
						onChange={(event) => {
							setBranch(event.target.value);
							setIsLoaded(false);
						}}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="github-compose-path">Compose path</FieldLabel>
					<Input
						id="github-compose-path"
						value={composePath}
						onChange={(event) => {
							setComposePath(event.target.value);
							setIsLoaded(false);
							setLoadError("");
						}}
						placeholder="compose.yaml"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="github-env-path">Env path</FieldLabel>
					<Input
						id="github-env-path"
						value={envPath}
						onChange={(event) => {
							setEnvPath(event.target.value);
							setIsLoaded(false);
							setLoadError("");
						}}
						placeholder=".env.production"
					/>
				</Field>
			</div>

			{pathSuggestions.length ? (
				<div className="flex flex-wrap items-center gap-1">
					<span className="text-[10px] uppercase tracking-wider text-muted">Detected:</span>
					{pathSuggestions.map((path) => (
						<button
							key={path}
							type="button"
							onClick={() => {
								setComposePath(path);
								setIsLoaded(false);
								void loadRepositoryFiles(path);
							}}
							className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${composePath === path ? "bg-accent/8 font-medium text-accent" : "text-muted hover:text-foreground"}`}
						>
							{path}
						</button>
					))}
				</div>
			) : null}

			<div className="flex items-center gap-2">
				<Button
					type="button"
					onClick={() => void loadRepositoryFiles()}
					disabled={!selectedRepository || isPending}
					size="sm"
				>
					{isPending ? "Loading..." : "Load files"}
				</Button>
				{loadError ? <p className="text-xs text-danger">{loadError}</p> : null}
			</div>

			{/* Auto-deploy */}
			<div className="flex items-center gap-3 rounded-lg border border-default/8 px-3 py-2.5">
				<label className="flex items-center gap-2 text-xs">
					<input
						type="checkbox"
						checked={autoDeployEnabled}
						onChange={(event) => setAutoDeployEnabled(event.target.checked)}
					/>
					<span className="font-medium">Auto-deploy on push</span>
				</label>
				{autoDeployEnabled ? (
					<Input
						value={autoDeployPaths}
						onChange={(event) => setAutoDeployPaths(event.target.value)}
						placeholder="Path filters (optional)"
						inputSize="sm"
						className="flex-1 text-xs"
					/>
				) : null}
			</div>

			{/* Source preview */}
			<div>
				<button
					type="button"
					onClick={() => setShowEditor(!showEditor)}
					className="flex w-full items-center justify-between"
				>
					<p className="text-xs font-medium text-muted">Source preview</p>
					{showEditor ? (
						<ChevronDown className="h-3.5 w-3.5 text-muted" />
					) : (
						<ChevronRight className="h-3.5 w-3.5 text-muted" />
					)}
				</button>
				{showEditor ? (
					<div className="mt-3 grid gap-0 overflow-hidden rounded-lg border border-default/8 lg:grid-cols-[1.4fr_0.6fr]">
						<div className="min-h-0 border-b border-default/8 lg:border-b-0 lg:border-r">
							<div className="border-b border-default/5 bg-foreground/[0.02] px-3 py-1.5">
								<p className="text-[11px] font-medium text-muted">
									{composePath || "compose.yaml"}
								</p>
							</div>
							<CodeEditor
								value={composeYaml}
								onChange={setComposeYaml}
								language="yaml"
								minHeight="280px"
								maxHeight={editorHeight}
								height={editorHeight}
								placeholder="Load a repository to populate this editor."
							/>
						</div>
						<div className="min-h-0">
							<div className="border-b border-default/5 bg-foreground/[0.02] px-3 py-1.5">
								<p className="text-[11px] font-medium text-muted">{envPath || ".env"}</p>
							</div>
							<CodeEditor
								value={envFileContent}
								onChange={setEnvFileContent}
								language="env"
								minHeight="280px"
								maxHeight={editorHeight}
								height={editorHeight}
								placeholder="Optional env file."
							/>
						</div>
					</div>
				) : null}
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between border-t border-default/8 pt-4">
				<Button type="button" variant="ghost" size="sm" onClick={() => setStep("source")}>
					<ArrowLeft className="h-3 w-3" />
					Back
				</Button>
				<FormSubmitButton
					label="Create stack"
					pendingLabel="Creating..."
					size="sm"
					disabled={!canCreateStack}
					title={canCreateStack ? undefined : "Set branch + compose path first."}
				/>
			</div>
		</form>
	);
}
