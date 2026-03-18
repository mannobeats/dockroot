"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type {
	GitHubProviderOption,
	InstallationOption,
	InstallationRepository,
} from "@/components/github-types";
import { useComposePathSuggestions } from "@/components/stack-github-form/hooks/use-compose-path-suggestions";
import { useGitHubInstallationData } from "@/components/stack-github-form/hooks/use-github-installation-data";
import { useLoadRepositoryFiles } from "@/components/stack-github-form/hooks/use-load-repository-files";

export type StackGitHubWizardStep = "source" | "configure";

export function useStackGitHubFormState(input: {
	appConfigured: boolean;
	installations: InstallationOption[];
	providers: GitHubProviderOption[];
}) {
	const editorHeight = "min(70vh, 800px)";
	const [step, setStep] = useState<StackGitHubWizardStep>("source");
	const {
		installationId,
		installationOptions,
		installationStateMessage,
		providerOptions,
		setInstallationId,
	} = useGitHubInstallationData({
		appConfigured: input.appConfigured,
		installations: input.installations,
		providers: input.providers,
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
		(repository: InstallationRepository) => {
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

	return {
		editorHeight,
		step,
		setStep,
		installationId,
		installationOptions,
		installationStateMessage,
		providerOptions,
		repositoryQuery,
		setRepositoryQuery,
		repositoryId,
		stackName,
		description,
		branch,
		composePath,
		envPath,
		composeYaml,
		envFileContent,
		autoDeployEnabled,
		autoDeployPaths,
		loadError,
		headSha,
		isLoaded,
		isPending,
		showEditor,
		activeInstallation,
		repositories,
		filteredRepositories,
		selectedRepository,
		canContinue,
		canCreateStack,
		handleInstallationSelect,
		handleRepositorySelect,
		loadRepositoryFiles,
		pathSuggestions,
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
	};
}
