"use client";

import {
	Check,
	ChevronDown,
	ChevronRight,
	GitBranch,
	RefreshCw,
	Search,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { CodeEditor } from "@/components/code-editor";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface InstallationRepository {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	default_branch: string;
	owner: {
		login: string;
	};
}

export interface InstallationOption {
	id: string;
	providerId?: string | null;
	appSlug?: string | null;
	accountLogin: string;
	accountType: string | null;
	repositories: InstallationRepository[];
	repositoryError?: string;
}

export interface GitHubProviderOption {
	id: string;
	name: string;
	appSlug: string;
	githubAppId: string;
	createdAt: string | Date;
	updatedAt: string | Date;
}

export function StackGitHubForm({
	environments,
	installations,
	providers,
	redirectTo,
	appConfigured,
	action,
}: {
	environments: Array<{ id: string; name: string; kind: string }>;
	installations: InstallationOption[];
	providers: GitHubProviderOption[];
	redirectTo: string;
	appConfigured: boolean;
	action: (formData: FormData) => void | Promise<void>;
}) {
	const editorHeight = "min(50vh, 480px)";
	const [installationOptions, setInstallationOptions] = useState(installations);
	const [_installationState, setInstallationState] = useState<
		"idle" | "refreshing" | "ready" | "error"
	>(installations.length ? "ready" : "idle");
	const [installationStateMessage, setInstallationStateMessage] = useState("");
	const [providerOptions, setProviderOptions] = useState(providers);
	const [selectedProviderId, setSelectedProviderId] = useState(providers[0]?.id || "");
	const [manifestName, setManifestName] = useState("Dockroot GitHub App");
	const [manifestOwner, setManifestOwner] = useState("");
	const [manifestError, setManifestError] = useState("");
	const [providerActionMessage, setProviderActionMessage] = useState("");
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
	const [showEditor, setShowEditor] = useState(false);

	const activeInstallation = installationOptions.find(
		(installation) => installation.id === installationId,
	);
	const activeProvider =
		providerOptions.find((provider) => provider.id === selectedProviderId) || null;
	const visibleInstallations = useMemo(() => {
		if (!selectedProviderId) {
			return installationOptions;
		}

		return installationOptions.filter(
			(installation) => (installation.providerId || "") === selectedProviderId,
		);
	}, [installationOptions, selectedProviderId]);
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

				const providerMatch = selectedProviderId
					? nextInstallations.find(
							(installation) => (installation.providerId || "") === selectedProviderId,
						)
					: null;
				return providerMatch?.id || nextInstallations[0]?.id || "";
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
	}, [appConfigured, selectedProviderId]);

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
			setSelectedProviderId((current) => {
				if (current && nextProviders.some((provider) => provider.id === current)) {
					return current;
				}
				return nextProviders[0]?.id || "";
			});
		} catch {
			// keep existing provider state on transient failures
		}
	}, [appConfigured]);

	const deleteProvider = useCallback(
		async (providerId: string) => {
			setProviderActionMessage("");
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
					throw new Error(payload.error || "Unable to delete GitHub App.");
				}

				await refreshProviders();
				await refreshInstallations();
				if ((payload.remoteFailures || []).length) {
					setProviderActionMessage(
						`App removed. ${payload.remoteUninstalled || 0} installations uninstalled; some failed.`,
					);
				} else {
					setProviderActionMessage(
						`App removed. ${payload.remoteUninstalled || 0} installations uninstalled.`,
					);
				}
			} catch (error) {
				setProviderActionMessage(
					error instanceof Error ? error.message : "Unable to delete GitHub App.",
				);
			}
		},
		[refreshInstallations, refreshProviders],
	);

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
		setSelectedProviderId((current) => current || providers[0]?.id || "");
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
		if (!visibleInstallations.length) {
			setInstallationId("");
			return;
		}

		setInstallationId((current) => {
			if (current && visibleInstallations.some((installation) => installation.id === current)) {
				return current;
			}
			return visibleInstallations[0]?.id || "";
		});
	}, [visibleInstallations]);

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

	function startManifestFlow() {
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
	}

	/* ── No installations: bootstrap flow ──────────── */
	if (!installationOptions.length) {
		return (
			<div className="space-y-4">
				<div className="rounded-lg border border-default/8 p-4">
					<p className="text-xs font-medium text-muted">Connect GitHub</p>
					<p className="mt-1 text-sm text-muted">
						Create a GitHub App, install it on your repositories, then return here.
					</p>

					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="github-manifest-name">App name</FieldLabel>
							<Input
								id="github-manifest-name"
								value={manifestName}
								onChange={(event) => setManifestName(event.target.value)}
								placeholder="Dockroot GitHub App"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="github-manifest-owner">Organization (optional)</FieldLabel>
							<Input
								id="github-manifest-owner"
								value={manifestOwner}
								onChange={(event) => setManifestOwner(event.target.value)}
								placeholder="my-org"
							/>
						</Field>
					</div>
					{manifestError ? <p className="mt-2 text-xs text-danger">{manifestError}</p> : null}

					<div className="mt-4 flex items-center gap-2">
						{activeProvider ? (
							<>
								<Button
									type="button"
									size="sm"
									onClick={() => {
										window.location.href = `/api/github/install?providerId=${encodeURIComponent(activeProvider.id)}&redirectTo=${encodeURIComponent(redirectTo)}`;
									}}
								>
									Install {activeProvider.name}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={() => void refreshInstallations()}
								>
									<RefreshCw className="h-3 w-3" />
								</Button>
							</>
						) : (
							<Button type="button" size="sm" onClick={startManifestFlow}>
								Create GitHub App
							</Button>
						)}
					</div>
				</div>

				{providerOptions.length ? (
					<div className="rounded-lg border border-default/8 p-4">
						<p className="text-xs font-medium text-muted">Configured apps</p>
						<div className="mt-2 space-y-1">
							{providerOptions.map((provider) => (
								<div
									key={provider.id}
									className={`flex items-center justify-between rounded-md px-2.5 py-2 text-xs ${selectedProviderId === provider.id ? "bg-accent/6 text-foreground" : "text-muted"}`}
								>
									<label className="flex items-center gap-2 cursor-pointer">
										<input
											type="radio"
											name="providerId"
											value={provider.id}
											checked={selectedProviderId === provider.id}
											onChange={(event) => setSelectedProviderId(event.target.value)}
											className="h-3 w-3"
										/>
										<span className="font-medium">{provider.name}</span>
									</label>
									<button
										type="button"
										className="text-[10px] text-danger hover:underline"
										onClick={(event) => {
											event.preventDefault();
											void deleteProvider(provider.id);
										}}
									>
										Remove
									</button>
								</div>
							))}
						</div>
					</div>
				) : null}

				{providerActionMessage ? (
					<p className="text-xs text-muted">{providerActionMessage}</p>
				) : null}
				{installationStateMessage ? (
					<p className="text-xs text-muted">{installationStateMessage}</p>
				) : null}
			</div>
		);
	}

	/* ── Main form ─────────────────────────────────── */
	return (
		<form action={action} className="space-y-5">
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

			{/* Repository selection */}
			<div>
				<div className="flex items-center justify-between">
					<p className="text-xs font-medium text-muted">Repository</p>
					<div className="flex items-center gap-1.5">
						<Dropdown className="min-w-32">
							<DropdownTrigger size="sm">{activeProvider?.name || "Provider"}</DropdownTrigger>
							<DropdownMenu>
								{providerOptions.map((provider) => (
									<DropdownItem
										key={provider.id}
										value={provider.id}
										selected={selectedProviderId === provider.id}
										onSelect={(id) => {
											setSelectedProviderId(id);
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
										{provider.name}
									</DropdownItem>
								))}
							</DropdownMenu>
						</Dropdown>
						<Dropdown>
							<DropdownTrigger size="sm">
								{activeInstallation?.accountLogin || "Account"}
							</DropdownTrigger>
							<DropdownMenu>
								{visibleInstallations.map((installation) => (
									<DropdownItem
										key={installation.id}
										value={installation.id}
										selected={installationId === installation.id}
										onSelect={(id) => {
											setInstallationId(id);
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
										{installation.accountLogin}
									</DropdownItem>
								))}
							</DropdownMenu>
						</Dropdown>
						<button
							type="button"
							onClick={() => {
								void refreshProviders();
								void refreshInstallations();
							}}
							className="rounded-md p-1.5 text-muted transition-colors hover:text-foreground"
						>
							<RefreshCw className="h-3 w-3" />
						</button>
					</div>
				</div>

				<div className="relative mt-2">
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

				<div className="mt-1.5 max-h-44 overflow-auto rounded-lg border border-default/8">
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

				{/* App management row - compact */}
				<div className="mt-2 flex flex-wrap items-center gap-2">
					<Input
						value={manifestName}
						onChange={(event) => setManifestName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.preventDefault();
						}}
						placeholder="New GitHub App name"
						inputSize="sm"
						className="max-w-48 text-xs"
					/>
					<Button type="button" size="xs" variant="outline" onClick={startManifestFlow}>
						New App
					</Button>
					<Button
						type="button"
						size="xs"
						onClick={() => {
							if (!selectedProviderId) return;
							window.location.href = `/api/github/install?providerId=${encodeURIComponent(selectedProviderId)}&redirectTo=${encodeURIComponent(redirectTo)}`;
						}}
						disabled={!selectedProviderId}
					>
						Install
					</Button>
					<Button
						type="button"
						size="xs"
						variant="ghost"
						onClick={() => {
							if (!selectedProviderId) return;
							void deleteProvider(selectedProviderId);
						}}
						disabled={!selectedProviderId}
					>
						Remove App
					</Button>
				</div>
				{manifestError ? <p className="mt-1 text-xs text-danger">{manifestError}</p> : null}
				{providerActionMessage ? (
					<p className="mt-1 text-xs text-muted">{providerActionMessage}</p>
				) : null}
			</div>

			{/* Configuration */}
			<div className="border-t border-default/8 pt-5">
				<p className="text-xs font-medium text-muted">Configuration</p>
				<div className="mt-3 grid gap-3 sm:grid-cols-2">
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
				<Field className="mt-3">
					<FieldLabel htmlFor="github-stack-description">Description</FieldLabel>
					<Input
						id="github-stack-description"
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Frontend + API + worker"
					/>
				</Field>
				<div className="mt-3 grid gap-3 sm:grid-cols-3">
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
					<div className="mt-2 flex flex-wrap items-center gap-1">
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

				<div className="mt-3 flex items-center gap-2">
					<Button
						type="button"
						onClick={() => void loadRepositoryFiles()}
						disabled={!selectedRepository || isPending}
						size="sm"
					>
						{isPending ? "Loading..." : "Load files"}
					</Button>
					{isLoaded ? (
						<span className="inline-flex items-center gap-1.5 text-xs text-success">
							<Sparkles className="h-3 w-3" />
							{headSha?.slice(0, 8)}
						</span>
					) : null}
					{loadError ? <p className="text-xs text-danger">{loadError}</p> : null}
				</div>

				{/* Auto-deploy */}
				<div className="mt-3 flex items-center gap-3 rounded-lg border border-default/8 px-3 py-2.5">
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
			</div>

			{/* Source review */}
			<div className="border-t border-default/8 pt-5">
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
					<div className="mt-3 grid gap-0 overflow-hidden rounded-lg border border-default/8 xl:grid-cols-[1.4fr_0.6fr]">
						<div className="min-h-0 border-b border-default/8 xl:border-b-0 xl:border-r">
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

				{/* Footer */}
				<div className="mt-4 flex items-center justify-between">
					<p className="text-xs text-muted">
						{selectedRepository?.full_name || "Select a repository"}
					</p>
					<FormSubmitButton
						label="Create stack"
						pendingLabel="Creating..."
						size="sm"
						disabled={!canCreateStack}
						title={
							canCreateStack
								? undefined
								: "Select a repository and set branch + compose path first."
						}
					/>
				</div>
			</div>
		</form>
	);
}
