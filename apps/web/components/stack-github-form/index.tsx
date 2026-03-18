"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { GitHubProviderOption, InstallationOption } from "@/components/github-types";
import { StackGitHubConfigureForm } from "@/components/stack-github-form/configure-form";
import { StackGitHubEmptyInstallations } from "@/components/stack-github-form/empty-installations";
import { useComposePathSuggestions } from "@/components/stack-github-form/hooks/use-compose-path-suggestions";
import { useGitHubInstallationData } from "@/components/stack-github-form/hooks/use-github-installation-data";
import { useLoadRepositoryFiles } from "@/components/stack-github-form/hooks/use-load-repository-files";
import { StackGitHubSourceStep } from "@/components/stack-github-form/source-step";
import { StackGitHubStepIndicator } from "@/components/stack-github-form/step-indicator";

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
	const {
		installationId,
		installationOptions,
		installationStateMessage,
		providerOptions,
		setInstallationId,
	} = useGitHubInstallationData({
		appConfigured,
		installations,
		providers,
	});
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

	const resetLoadedSourceFields = useCallback(() => {
		setIsLoaded(false);
		setComposePath("");
		setComposeYaml("");
		setEnvFileContent("");
		setHeadSha("");
		setLoadError("");
	}, []);

	const handleInstallationSelect = useCallback(
		(value: string) => {
			setInstallationId(value);
			setRepositoryQuery("");
			setRepositoryId("");
			resetLoadedSourceFields();
		},
		[resetLoadedSourceFields, setInstallationId],
	);

	const handleRepositorySelect = useCallback(
		(repository: NonNullable<typeof selectedRepository>) => {
			setRepositoryId(String(repository.id));
			setStackName(repository.name);
			setBranch(repository.default_branch || "main");
			resetLoadedSourceFields();
		},
		[resetLoadedSourceFields],
	);

	const loadRepositoryFiles = useLoadRepositoryFiles({
		selectedRepository,
		installationId,
		branch,
		composePath,
		envPath,
		startTransition,
		setComposePath,
		setComposeYaml,
		setEnvFileContent,
		setHeadSha,
		setIsLoaded,
		setShowEditor,
		setLoadError,
	});

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

	const pathSuggestions = useComposePathSuggestions({
		branch,
		composePath,
		installationId,
		selectedRepository,
		onDefaultComposePath: setComposePath,
	});

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
			<StackGitHubSourceStep
				stepIndicator={stepIndicator}
				activeInstallation={activeInstallation}
				installationOptions={installationOptions}
				installationId={installationId}
				providerOptions={providerOptions}
				repositoryQuery={repositoryQuery}
				filteredRepositories={filteredRepositories}
				repositoryId={repositoryId}
				canContinue={canContinue}
				selectedRepository={selectedRepository}
				onSelectInstallation={handleInstallationSelect}
				onRepositoryQueryChange={setRepositoryQuery}
				onSelectRepository={handleRepositorySelect}
				onContinue={() => setStep("configure")}
			/>
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
