import { ArrowLeft, ChevronDown, ChevronRight, GitBranch, Github, Sparkles } from "lucide-react";
import { FormSubmitButton } from "@/components/form-submit-button";
import type { InstallationRepository } from "@/components/github-types";
import { ResizableEditorPanels } from "@/components/resizable-editor-panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function StackGitHubConfigureForm({
	action,
	installationId,
	repositoryId,
	selectedRepository,
	stackName,
	description,
	branch,
	composePath,
	envPath,
	composeYaml,
	envFileContent,
	autoDeployEnabled,
	autoDeployPaths,
	stepIndicator,
	isLoaded,
	headSha,
	environments,
	defaultEnvironmentId,
	pathSuggestions,
	loadRepositoryFiles,
	isPending,
	loadError,
	showEditor,
	setStackName,
	setDescription,
	setBranch,
	setComposePath,
	setEnvPath,
	setComposeYaml,
	setEnvFileContent,
	setAutoDeployEnabled,
	setAutoDeployPaths,
	setShowEditor,
	setIsLoaded,
	setLoadError,
	onBack,
	canCreateStack,
	editorHeight,
}: {
	action: (formData: FormData) => void | Promise<void>;
	installationId: string;
	repositoryId: string;
	selectedRepository?: InstallationRepository;
	stackName: string;
	description: string;
	branch: string;
	composePath: string;
	envPath: string;
	composeYaml: string;
	envFileContent: string;
	autoDeployEnabled: boolean;
	autoDeployPaths: string;
	stepIndicator: React.ReactNode;
	isLoaded: boolean;
	headSha: string;
	environments: Array<{ id: string; name: string; kind: string }>;
	defaultEnvironmentId?: string;
	pathSuggestions: string[];
	loadRepositoryFiles: (nextComposePath?: string) => Promise<void>;
	isPending: boolean;
	loadError: string;
	showEditor: boolean;
	setStackName: (value: string) => void;
	setDescription: (value: string) => void;
	setBranch: (value: string) => void;
	setComposePath: (value: string) => void;
	setEnvPath: (value: string) => void;
	setComposeYaml: (value: string) => void;
	setEnvFileContent: (value: string) => void;
	setAutoDeployEnabled: (value: boolean) => void;
	setAutoDeployPaths: (value: string) => void;
	setShowEditor: (value: boolean) => void;
	setIsLoaded: (value: boolean) => void;
	setLoadError: (value: string) => void;
	onBack: () => void;
	canCreateStack: boolean;
	editorHeight: string;
}) {
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
					<Select
						id="github-environment-id"
						name="environmentId"
						required
						defaultValue={defaultEnvironmentId || environments[0]?.id}
					>
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
					<div className="mt-3">
						<ResizableEditorPanels
							leftLabel={composePath || "compose.yaml"}
							rightLabel={envPath || ".env"}
							leftValue={composeYaml}
							rightValue={envFileContent}
							onLeftChange={setComposeYaml}
							onRightChange={setEnvFileContent}
							leftLanguage="yaml"
							rightLanguage="env"
							leftPlaceholder="Load a repository to populate this editor."
							rightPlaceholder="Optional env file."
							height={editorHeight}
						/>
					</div>
				) : null}
			</div>

			<div className="flex items-center justify-between border-t border-default/8 pt-4">
				<Button type="button" variant="ghost" size="sm" onClick={onBack}>
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
