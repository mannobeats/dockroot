"use client";

import type { GitHubProviderOption, InstallationOption } from "@/components/github-types";
import { StackGitHubConfigureForm } from "@/components/stack-github-form/configure-form";
import { StackGitHubEmptyInstallations } from "@/components/stack-github-form/empty-installations";
import { useStackGitHubFormState } from "@/components/stack-github-form/hooks/use-stack-github-form-state";
import { StackGitHubSourceStep } from "@/components/stack-github-form/source-step";
import { StackGitHubStepIndicator } from "@/components/stack-github-form/step-indicator";

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
	const state = useStackGitHubFormState({
		appConfigured,
		installations,
		providers,
	});

	if (!state.installationOptions.length) {
		return (
			<StackGitHubEmptyInstallations
				appConfigured={appConfigured}
				providerOptions={state.providerOptions}
				installationStateMessage={state.installationStateMessage}
			/>
		);
	}

	const stepIndicator = (
		<StackGitHubStepIndicator
			step={state.step}
			canContinue={state.canContinue}
			onSetSource={() => state.setStep("source")}
			onSetConfigure={() => {
				if (state.canContinue) {
					state.setStep("configure");
				}
			}}
		/>
	);

	if (state.step === "source") {
		return (
			<StackGitHubSourceStep
				stepIndicator={stepIndicator}
				activeInstallation={state.activeInstallation}
				installationOptions={state.installationOptions}
				installationId={state.installationId}
				providerOptions={state.providerOptions}
				repositoryQuery={state.repositoryQuery}
				filteredRepositories={state.filteredRepositories}
				repositoryId={state.repositoryId}
				canContinue={state.canContinue}
				selectedRepository={state.selectedRepository}
				onSelectInstallation={state.handleInstallationSelect}
				onRepositoryQueryChange={state.setRepositoryQuery}
				onSelectRepository={state.handleRepositorySelect}
				onContinue={() => state.setStep("configure")}
			/>
		);
	}

	return (
		<StackGitHubConfigureForm
			action={action}
			installationId={state.installationId}
			repositoryId={state.repositoryId}
			selectedRepository={state.selectedRepository}
			stackName={state.stackName}
			description={state.description}
			branch={state.branch}
			composePath={state.composePath}
			envPath={state.envPath}
			composeYaml={state.composeYaml}
			envFileContent={state.envFileContent}
			autoDeployEnabled={state.autoDeployEnabled}
			autoDeployPaths={state.autoDeployPaths}
			stepIndicator={stepIndicator}
			isLoaded={state.isLoaded}
			headSha={state.headSha}
			environments={environments}
			defaultEnvironmentId={defaultEnvironmentId}
			pathSuggestions={state.pathSuggestions}
			loadRepositoryFiles={state.loadRepositoryFiles}
			isPending={state.isPending}
			loadError={state.loadError}
			showEditor={state.showEditor}
			setStackName={state.setStackName}
			setDescription={state.setDescription}
			setBranch={state.setBranch}
			setComposePath={state.setComposePath}
			setEnvPath={state.setEnvPath}
			setComposeYaml={state.setComposeYaml}
			setEnvFileContent={state.setEnvFileContent}
			setAutoDeployEnabled={state.setAutoDeployEnabled}
			setAutoDeployPaths={state.setAutoDeployPaths}
			setShowEditor={state.setShowEditor}
			setIsLoaded={state.setIsLoaded}
			setLoadError={state.setLoadError}
			onBack={() => state.setStep("source")}
			canCreateStack={state.canCreateStack}
			editorHeight={state.editorHeight}
		/>
	);
}
