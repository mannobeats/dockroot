import { StackGitHubConfigureAutoDeploySection } from "./configure-auto-deploy-section";
import { StackGitHubConfigureEditorSection } from "./configure-editor-section";
import { StackGitHubConfigureFooterActions } from "./configure-footer-actions";
import type { StackGitHubConfigureValues } from "./configure-form-types";
import { StackGitHubConfigureMetadataFields } from "./configure-metadata-fields";
import { StackGitHubConfigureRepositorySummary } from "./configure-repository-summary";
import { StackGitHubConfigureSourceFields } from "./configure-source-fields";

type StackGitHubConfigureFormBodyProps = Pick<
	StackGitHubConfigureValues,
	| "selectedRepository"
	| "stackName"
	| "description"
	| "branch"
	| "composePath"
	| "envPath"
	| "composeYaml"
	| "envFileContent"
	| "autoDeployEnabled"
	| "autoDeployPaths"
	| "stepIndicator"
	| "isLoaded"
	| "headSha"
	| "environments"
	| "defaultEnvironmentId"
	| "pathSuggestions"
	| "loadRepositoryFiles"
	| "isPending"
	| "loadError"
	| "showEditor"
	| "setStackName"
	| "setDescription"
	| "setBranch"
	| "setComposePath"
	| "setEnvPath"
	| "setComposeYaml"
	| "setEnvFileContent"
	| "setAutoDeployEnabled"
	| "setAutoDeployPaths"
	| "setShowEditor"
	| "setIsLoaded"
	| "setLoadError"
	| "onBack"
	| "canCreateStack"
	| "editorHeight"
>;

export function StackGitHubConfigureFormBody({
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
}: StackGitHubConfigureFormBodyProps) {
	return (
		<>
			{stepIndicator}

			<StackGitHubConfigureRepositorySummary
				repositoryFullName={selectedRepository?.full_name}
				branch={branch}
				isLoaded={isLoaded}
				headSha={headSha}
			/>

			<StackGitHubConfigureMetadataFields
				stackName={stackName}
				description={description}
				environments={environments}
				defaultEnvironmentId={defaultEnvironmentId}
				setStackName={setStackName}
				setDescription={setDescription}
			/>

			<StackGitHubConfigureSourceFields
				selectedRepository={selectedRepository}
				branch={branch}
				composePath={composePath}
				envPath={envPath}
				pathSuggestions={pathSuggestions}
				isPending={isPending}
				loadError={loadError}
				setBranch={setBranch}
				setComposePath={setComposePath}
				setEnvPath={setEnvPath}
				setIsLoaded={setIsLoaded}
				setLoadError={setLoadError}
				loadRepositoryFiles={loadRepositoryFiles}
			/>

			<StackGitHubConfigureAutoDeploySection
				autoDeployEnabled={autoDeployEnabled}
				autoDeployPaths={autoDeployPaths}
				setAutoDeployEnabled={setAutoDeployEnabled}
				setAutoDeployPaths={setAutoDeployPaths}
			/>

			<StackGitHubConfigureEditorSection
				showEditor={showEditor}
				composePath={composePath}
				envPath={envPath}
				composeYaml={composeYaml}
				envFileContent={envFileContent}
				editorHeight={editorHeight}
				setShowEditor={setShowEditor}
				setComposeYaml={setComposeYaml}
				setEnvFileContent={setEnvFileContent}
			/>

			<StackGitHubConfigureFooterActions onBack={onBack} canCreateStack={canCreateStack} />
		</>
	);
}
