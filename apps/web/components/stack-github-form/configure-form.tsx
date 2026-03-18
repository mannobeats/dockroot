import { StackGitHubConfigureFormBody } from "@/components/stack-github-form/configure-form-body";
import { StackGitHubConfigureFormHiddenInputs } from "@/components/stack-github-form/configure-form-hidden-inputs";
import type { StackGitHubConfigureValues } from "@/components/stack-github-form/configure-form-types";

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
}: StackGitHubConfigureValues) {
	return (
		<form action={action} className="space-y-4">
			<StackGitHubConfigureFormHiddenInputs
				installationId={installationId}
				repositoryId={repositoryId}
				owner={selectedRepository?.owner.login || ""}
				repository={selectedRepository?.name || ""}
				stackName={stackName}
				description={description}
				branch={branch}
				composePath={composePath}
				envPath={envPath}
				composeYaml={composeYaml}
				envFileContent={envFileContent}
				autoDeployEnabled={autoDeployEnabled}
				autoDeployPaths={autoDeployPaths}
			/>
			<StackGitHubConfigureFormBody
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
				onBack={onBack}
				canCreateStack={canCreateStack}
				editorHeight={editorHeight}
			/>
		</form>
	);
}
