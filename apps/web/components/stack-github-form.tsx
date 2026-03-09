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
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
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
	accountLogin: string;
	accountType: string | null;
	repositories: InstallationRepository[];
	repositoryError?: string;
}

export function StackGitHubForm({
	environments,
	installations,
	redirectTo,
	appConfigured,
	action,
}: {
	environments: Array<{ id: string; name: string; kind: string }>;
	installations: InstallationOption[];
	redirectTo: string;
	appConfigured: boolean;
	action: (formData: FormData) => void | Promise<void>;
}) {
	const editorHeight = "min(60vh, 640px)";
	const [installationOptions, setInstallationOptions] = useState(installations);
	const [_installationState, setInstallationState] = useState<
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
	const [showEditor, setShowEditor] = useState(false);

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
			<EmptyState
				title={
					appConfigured
						? "No GitHub App installations connected yet."
						: "GitHub App environment variables are not configured yet."
				}
				description={
					appConfigured
						? "Install the GitHub App once, then deploy repositories without pasting tokens."
						: "Set GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_WEBHOOK_SECRET."
				}
				actions={
					appConfigured ? (
						<>
							<LinkButton
								href={`/api/github/install?redirectTo=${encodeURIComponent(redirectTo)}`}
								prefetch={false}
								size="sm"
							>
								Connect GitHub App
							</LinkButton>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => void refreshInstallations()}
							>
								<RefreshCw className="mr-1.5 h-3 w-3" />
								Refresh
							</Button>
						</>
					) : null
				}
				className="p-8"
			>
				{installationStateMessage ? (
					<p className="mt-3 text-xs text-muted">{installationStateMessage}</p>
				) : null}
			</EmptyState>
		);
	}

	return (
		<form action={action} className="space-y-6">
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

			{/* Step 1: Select repository */}
			<div>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-[10px] font-bold text-white">
							1
						</div>
						<p className="text-sm font-semibold">Select repository</p>
					</div>
					<div className="flex items-center gap-2">
						<Select
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
							selectSize="sm"
							className="h-7 px-2 text-xs"
						>
							{installationOptions.map((installation) => (
								<option key={installation.id} value={installation.id}>
									{installation.accountLogin}
								</option>
							))}
						</Select>
						<Button
							type="button"
							variant="ghost"
							size="xs"
							onClick={() => void refreshInstallations()}
						>
							<RefreshCw className="h-3 w-3" />
						</Button>
					</div>
				</div>
				<div className="relative mt-3">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
					<Input
						value={repositoryQuery}
						onChange={(event) => setRepositoryQuery(event.target.value)}
						placeholder="Search repositories..."
						withIcon
						inputSize="sm"
						className="text-xs"
					/>
				</div>
				<div className="mt-2 max-h-52 overflow-auto rounded-xl border border-default/8">
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
									className={`flex w-full items-center justify-between border-b border-default/5 px-3.5 py-2.5 text-left text-xs last:border-b-0 transition-colors ${active ? "bg-accent/6 text-foreground" : "text-muted hover:bg-foreground/[0.02] hover:text-foreground"}`}
								>
									<div className="flex min-w-0 items-center gap-2">
										{active ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
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
						<p className="px-4 py-6 text-center text-xs text-muted">No repositories match.</p>
					)}
				</div>
				{selectedRepository ? (
					<p className="mt-2 text-xs text-muted">
						Selected:{" "}
						<span className="font-medium text-foreground">{selectedRepository.full_name}</span>
					</p>
				) : null}
				{activeInstallation?.repositoryError ? (
					<Alert className="mt-2 text-xs">{activeInstallation.repositoryError}</Alert>
				) : null}
			</div>

			{/* Step 2: Configuration */}
			<div className="border-t border-default/8 pt-6">
				<div className="flex items-center gap-3">
					<div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-[10px] font-bold text-white">
						2
					</div>
					<p className="text-sm font-semibold">Configure stack</p>
				</div>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
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
				<Field className="mt-4">
					<FieldLabel htmlFor="github-stack-description">Description</FieldLabel>
					<Input
						id="github-stack-description"
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Frontend + API + worker"
					/>
				</Field>
				<div className="mt-4 grid gap-4 sm:grid-cols-3">
					<Field>
						<FieldLabel htmlFor="github-stack-branch">
							<GitBranch className="inline h-3 w-3 mr-1" />
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
						<FieldLabel htmlFor="github-compose-path">Compose file path</FieldLabel>
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
						<FieldLabel htmlFor="github-env-path">Env file path</FieldLabel>
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
					<div className="mt-3 flex flex-wrap items-center gap-1.5">
						<span className="text-[10px] text-muted uppercase tracking-wider mr-1">Detected:</span>
						{pathSuggestions.map((path) => (
							<button
								key={path}
								type="button"
								onClick={() => {
									setComposePath(path);
									setIsLoaded(false);
									void loadRepositoryFiles(path);
								}}
								className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${composePath === path ? "bg-accent/8 text-accent font-medium" : "text-muted hover:text-foreground hover:bg-foreground/[0.03]"}`}
							>
								{path}
							</button>
						))}
					</div>
				) : null}
				<div className="mt-4 flex items-center gap-3">
					<Button
						type="button"
						onClick={() => void loadRepositoryFiles()}
						disabled={!selectedRepository || isPending}
						size="sm"
					>
						{isPending ? "Loading..." : "Load repository"}
					</Button>
					{isLoaded ? (
						<span className="inline-flex items-center gap-1.5 text-xs text-success">
							<Sparkles className="h-3 w-3" />
							Loaded · {headSha?.slice(0, 8)}
						</span>
					) : null}
					{loadError ? <p className="text-xs text-danger">{loadError}</p> : null}
				</div>
				<p className="mt-3 text-[11px] text-muted leading-relaxed">
					Dockroot deploys the selected commit by materializing the repository on the target host,
					then running Docker Compose with your reviewed compose and env files. Rebuilds use the
					pinned commit SHA shown after load.
				</p>
			</div>

			{/* Step 3: Review & Create */}
			<div className="border-t border-default/8 pt-6">
				<button
					type="button"
					onClick={() => setShowEditor(!showEditor)}
					className="flex w-full items-center justify-between"
				>
					<div className="flex items-center gap-3">
						<div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-[10px] font-bold text-white">
							3
						</div>
						<p className="text-sm font-semibold">Review source</p>
					</div>
					{showEditor ? (
						<ChevronDown className="h-4 w-4 text-muted" />
					) : (
						<ChevronRight className="h-4 w-4 text-muted" />
					)}
				</button>
				{showEditor ? (
					<div className="mt-4 grid gap-0 overflow-hidden rounded-xl border border-default/8 xl:grid-cols-[1.4fr_0.6fr]">
						<div className="min-h-0 border-b border-default/8 xl:border-b-0 xl:border-r">
							<div className="border-b border-default/5 px-4 py-2.5">
								<p className="text-xs font-medium text-muted">{composePath || "compose.yaml"}</p>
							</div>
							<CodeEditor
								value={composeYaml}
								onChange={setComposeYaml}
								language="yaml"
								minHeight="360px"
								maxHeight={editorHeight}
								height={editorHeight}
								placeholder="Load a repository to populate this editor."
							/>
						</div>
						<div className="min-h-0">
							<div className="border-b border-default/5 px-4 py-2.5">
								<p className="text-xs font-medium text-muted">{envPath || ".env"}</p>
							</div>
							<CodeEditor
								value={envFileContent}
								onChange={setEnvFileContent}
								language="env"
								minHeight="360px"
								maxHeight={editorHeight}
								height={editorHeight}
								placeholder="Optional env file."
							/>
						</div>
					</div>
				) : null}

				{/* Footer */}
				<div className="mt-5 flex items-center justify-between rounded-xl border border-default/8 bg-background/40 px-5 py-4">
					<p className="text-xs text-muted">
						{selectedRepository?.full_name
							? `${selectedRepository.full_name}`
							: "Select a repository above"}
					</p>
					<FormSubmitButton label="Create stack" pendingLabel="Creating..." size="sm" />
				</div>
			</div>
		</form>
	);
}
