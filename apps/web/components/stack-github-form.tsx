"use client";

import { RefreshCw, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { CodeEditor } from "@/components/code-editor";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StatusBadge } from "@/components/status-badge";

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

interface InstallationOption {
	id: string;
	accountLogin: string;
	accountType: string | null;
	repositories: InstallationRepository[];
	repositoryError?: string;
}

export function StackGitHubForm({
	projectId,
	environments,
	installations,
	redirectTo,
	appConfigured,
	action,
}: {
	projectId: string;
	environments: Array<{ id: string; name: string; kind: string }>;
	installations: InstallationOption[];
	redirectTo: string;
	appConfigured: boolean;
	action: (formData: FormData) => void | Promise<void>;
}) {
	const [installationOptions, setInstallationOptions] = useState(installations);
	const [installationState, setInstallationState] = useState<
		"idle" | "refreshing" | "ready" | "error"
	>(installations.length ? "ready" : "idle");
	const [installationStateMessage, setInstallationStateMessage] = useState("");
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
	const [loadError, setLoadError] = useState("");
	const [pathSuggestions, setPathSuggestions] = useState<string[]>([]);
	const [headSha, setHeadSha] = useState("");
	const [isLoaded, setIsLoaded] = useState(false);
	const [isPending, startTransition] = useTransition();

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
		void refreshInstallations();
	}, [refreshInstallations]);

	useEffect(() => {
		function refreshOnFocus() {
			void refreshInstallations();
		}

		window.addEventListener("focus", refreshOnFocus);
		document.addEventListener("visibilitychange", refreshOnFocus);

		return () => {
			window.removeEventListener("focus", refreshOnFocus);
			document.removeEventListener("visibilitychange", refreshOnFocus);
		};
	}, [refreshInstallations]);

	useEffect(() => {
		const nextRepositoryId = repositories[0] ? String(repositories[0].id) : "";
		setRepositoryId(nextRepositoryId);
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
			<div className="rounded-2xl border border-dashed border-default/20 bg-background/60 p-6">
				<p className="text-sm font-medium">
					{appConfigured
						? "No GitHub App installations connected yet."
						: "GitHub App environment variables are not configured yet."}
				</p>
				<p className="mt-2 text-sm text-muted">
					{appConfigured
						? "Install the GitHub App once, then you can deploy public or private repositories without pasting tokens."
						: "Set GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_WEBHOOK_SECRET before connecting repositories."}
				</p>
				{appConfigured ? (
					<div className="mt-4 flex flex-wrap items-center gap-3">
						<Link
							href={`/api/github/install?redirectTo=${encodeURIComponent(redirectTo)}`}
							prefetch={false}
							className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
						>
							Connect GitHub App
						</Link>
						<button
							type="button"
							onClick={() => void refreshInstallations()}
							className="inline-flex h-11 items-center justify-center rounded-xl border border-default/15 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
						>
							<RefreshCw className="mr-2 h-4 w-4" />
							Refresh access
						</button>
					</div>
				) : null}
				{installationStateMessage ? (
					<p className="mt-3 text-sm text-muted">{installationStateMessage}</p>
				) : null}
			</div>
		);
	}

	return (
		<form action={action} className="space-y-5">
			<input type="hidden" name="projectId" value={projectId} />
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

			<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
							GitHub Source
						</p>
						<h3 className="mt-2 text-lg font-semibold tracking-tight">
							Load repository into the compose editor
						</h3>
						<p className="mt-1 max-w-2xl text-sm text-muted">
							Search the repositories this installation can access, choose a branch and file path,
							then load the compose source before creating the stack.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<StatusBadge status="healthy" />
						<span className="rounded-full bg-default/10 px-3 py-1 text-xs font-medium text-muted">
							{repositories.length} repositories available
						</span>
						<button
							type="button"
							onClick={() => void refreshInstallations()}
							className="inline-flex h-9 items-center justify-center rounded-full border border-default/15 bg-surface px-3 text-xs font-medium transition-colors hover:border-accent/30 hover:text-accent"
						>
							<RefreshCw className="mr-2 h-3.5 w-3.5" />
							Refresh access
						</button>
					</div>
				</div>
			</div>

			<div className="grid gap-5 2xl:grid-cols-[0.92fr_1.08fr]">
				<section className="space-y-5">
					<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
						<div className="space-y-1.5">
							<label htmlFor="installationId-select" className="text-sm font-medium">
								GitHub App installation
							</label>
							<select
								id="installationId-select"
								value={installationId}
								onChange={(event) => {
									setInstallationId(event.target.value);
									setRepositoryQuery("");
									setRepositoryId("");
									setIsLoaded(false);
									setComposePath("");
									setComposeYaml("");
									setEnvFileContent("");
									setHeadSha("");
									setLoadError("");
								}}
								className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
							>
								{installations.map((installation) => (
									<option key={installation.id} value={installation.id}>
										{installation.accountLogin}
										{installation.accountType ? ` (${installation.accountType})` : ""}
									</option>
								))}
							</select>
							{activeInstallation?.repositoryError ? (
								<p className="text-sm text-danger">{activeInstallation.repositoryError}</p>
							) : null}
							{installationStateMessage ? (
								<p
									className={`text-sm ${installationState === "error" ? "text-danger" : "text-muted"}`}
								>
									{installationStateMessage}
								</p>
							) : null}
						</div>

						<div className="mt-4 space-y-3">
							<label htmlFor="repository-search" className="text-sm font-medium">
								Repository search
							</label>
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
								<input
									id="repository-search"
									value={repositoryQuery}
									onChange={(event) => setRepositoryQuery(event.target.value)}
									placeholder="Search repositories by name"
									className="h-11 w-full rounded-xl border border-default/15 bg-background pl-10 pr-4 text-sm outline-none transition-colors focus:border-accent"
								/>
							</div>
							<div className="max-h-72 overflow-auto rounded-xl border border-default/15 bg-surface/70">
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
												className={`flex w-full items-center justify-between gap-3 border-b border-default/10 px-4 py-3 text-left last:border-b-0 ${active ? "bg-accent/10" : "hover:bg-default/5"}`}
											>
												<div>
													<p className="text-sm font-medium">{repository.full_name}</p>
													<p className="mt-1 text-xs text-muted">
														Default branch: {repository.default_branch}
													</p>
												</div>
												<div className="flex items-center gap-2">
													{repository.private ? (
														<span className="rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
															private
														</span>
													) : (
														<span className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
															public
														</span>
													)}
													{active ? <StatusBadge status="deploying" /> : null}
												</div>
											</button>
										);
									})
								) : (
									<div className="px-4 py-6 text-sm text-muted">
										No repositories match this search.
									</div>
								)}
							</div>
						</div>
					</div>

					<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-1.5">
								<label htmlFor="github-stack-name" className="text-sm font-medium">
									Stack name
								</label>
								<input
									id="github-stack-name"
									value={stackName}
									onChange={(event) => setStackName(event.target.value)}
									placeholder="customer-portal"
									className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
								/>
							</div>
							<div className="space-y-1.5">
								<label htmlFor="github-environment" className="text-sm font-medium">
									Target environment
								</label>
								<select
									id="github-environment"
									name="environmentId"
									required
									className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
								>
									{environments.map((environment) => (
										<option key={environment.id} value={environment.id}>
											{environment.name} ({environment.kind})
										</option>
									))}
								</select>
							</div>
						</div>

						<div className="mt-4 space-y-1.5">
							<label htmlFor="github-description" className="text-sm font-medium">
								Description
							</label>
							<input
								id="github-description"
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								placeholder="Frontend + API + worker"
								className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
							/>
						</div>

						<div className="mt-4 grid gap-4 md:grid-cols-2">
							<div className="space-y-1.5">
								<label htmlFor="branch" className="text-sm font-medium">
									Branch
								</label>
								<input
									id="branch"
									value={branch}
									onChange={(event) => {
										setBranch(event.target.value);
										setIsLoaded(false);
									}}
									className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
								/>
							</div>
							<div className="space-y-1.5">
								<label htmlFor="composePath" className="text-sm font-medium">
									Compose file path
								</label>
								<input
									id="composePath"
									value={composePath}
									onChange={(event) => {
										setComposePath(event.target.value);
										setIsLoaded(false);
										setLoadError("");
									}}
									placeholder="deploy/compose.prod.yaml"
									className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
								/>
							</div>
						</div>

						{pathSuggestions.length ? (
							<div className="mt-4">
								<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
									Detected compose files
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									{pathSuggestions.map((path) => (
										<button
											key={path}
											type="button"
											onClick={() => {
												setComposePath(path);
												setIsLoaded(false);
												void loadRepositoryFiles(path);
											}}
											className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${composePath === path ? "border-accent/40 bg-accent/10 text-accent" : "border-default/15 bg-surface text-muted hover:text-foreground"}`}
										>
											{path}
										</button>
									))}
								</div>
							</div>
						) : (
							<div className="mt-4 rounded-xl border border-dashed border-default/15 bg-surface/50 px-4 py-3 text-sm text-muted">
								No compose files were detected automatically for this branch yet. Enter a path
								manually, then load the repository.
							</div>
						)}

						<div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
							<div className="space-y-1.5">
								<label htmlFor="envPath" className="text-sm font-medium">
									Env file path
								</label>
								<input
									id="envPath"
									value={envPath}
									onChange={(event) => {
										setEnvPath(event.target.value);
										setIsLoaded(false);
										setLoadError("");
									}}
									placeholder="deploy/.env.production"
									className="h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
								/>
							</div>
							<button
								type="button"
								onClick={() => void loadRepositoryFiles()}
								disabled={!selectedRepository || isPending}
								className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isPending ? "Loading repository..." : "Load repository"}
							</button>
						</div>

						<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-default/15 bg-surface/70 px-4 py-3">
							<div>
								<p className="text-sm font-medium">
									{selectedRepository?.full_name || "Choose a repository"}
								</p>
								<p className="mt-1 text-xs text-muted">
									{headSha
										? `Loaded commit ${headSha.slice(0, 12)}`
										: composePath
											? "Selected file is ready to load into the editor."
											: "Choose a compose file path to load source into the editor."}
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Link
									href={`/api/github/install?redirectTo=${encodeURIComponent(redirectTo)}`}
									prefetch={false}
									className="text-sm font-medium text-accent"
								>
									Manage GitHub App
								</Link>
								<span className="rounded-full bg-default/10 px-3 py-1 text-xs font-medium text-muted">
									{selectedRepository?.private ? "Private repo access" : "Public repo access"}
								</span>
							</div>
						</div>

						{loadError ? <p className="mt-3 text-sm text-danger">{loadError}</p> : null}
					</div>
				</section>

				<section className="overflow-hidden rounded-2xl border border-default/15 bg-surface">
					<div className="border-b border-default/15 px-5 py-4">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
									Compose Workspace
								</p>
								<h3 className="mt-2 text-lg font-semibold tracking-tight">
									Review and edit before deployment
								</h3>
							</div>
							<div className="flex items-center gap-2">
								{isLoaded ? (
									<span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
										<Sparkles className="h-3.5 w-3.5" />
										Repository loaded
									</span>
								) : (
									<span className="rounded-full bg-default/10 px-3 py-1 text-xs font-semibold text-muted">
										Waiting for repository load
									</span>
								)}
							</div>
						</div>
					</div>

					<div className="grid gap-0 xl:grid-cols-[1.45fr_0.8fr]">
						<div className="border-b border-default/15 xl:border-b-0 xl:border-r">
							<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
								<div>
									<p className="text-sm font-semibold">Compose file</p>
									<p className="text-xs text-muted">
										{composePath || "Set a compose file path to load source"}
									</p>
								</div>
							</div>
							<CodeEditor
								value={composeYaml}
								onChange={setComposeYaml}
								language="yaml"
								minHeight="560px"
								placeholder="Load a repository to populate this editor."
							/>
						</div>

						<div>
							<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
								<div>
									<p className="text-sm font-semibold">Env file</p>
									<p className="text-xs text-muted">
										{envPath || "Optional environment variables"}
									</p>
								</div>
							</div>
							<CodeEditor
								value={envFileContent}
								onChange={setEnvFileContent}
								language="env"
								minHeight="560px"
								placeholder="Load an optional env file or leave empty."
							/>
						</div>
					</div>

					<div className="flex items-center justify-between gap-3 border-t border-default/15 px-5 py-4">
						<p className="text-sm text-muted">
							Deploys use the compose content saved here. Future GitHub pushes can refresh it.
						</p>
						<FormSubmitButton
							label="Create GitHub stack"
							pendingLabel="Creating stack..."
							className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
						/>
					</div>
				</section>
			</div>
		</form>
	);
}
