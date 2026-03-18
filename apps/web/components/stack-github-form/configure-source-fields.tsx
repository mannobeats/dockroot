import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function StackGitHubConfigureSourceFields({
	selectedRepository,
	branch,
	composePath,
	envPath,
	pathSuggestions,
	isPending,
	loadError,
	setBranch,
	setComposePath,
	setEnvPath,
	setIsLoaded,
	setLoadError,
	loadRepositoryFiles,
}: {
	selectedRepository?: { name: string };
	branch: string;
	composePath: string;
	envPath: string;
	pathSuggestions: string[];
	isPending: boolean;
	loadError: string;
	setBranch: (value: string) => void;
	setComposePath: (value: string) => void;
	setEnvPath: (value: string) => void;
	setIsLoaded: (value: boolean) => void;
	setLoadError: (value: string) => void;
	loadRepositoryFiles: (nextComposePath?: string) => Promise<void>;
}) {
	return (
		<>
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
		</>
	);
}
