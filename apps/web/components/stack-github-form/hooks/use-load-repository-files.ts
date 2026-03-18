"use client";

import type { TransitionStartFunction } from "react";
import { useCallback } from "react";
import type { InstallationRepository } from "@/components/github-types";

export function useLoadRepositoryFiles({
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
}: {
	selectedRepository?: InstallationRepository;
	installationId: string;
	branch: string;
	composePath: string;
	envPath: string;
	startTransition: TransitionStartFunction;
	setComposePath: (value: string) => void;
	setComposeYaml: (value: string) => void;
	setEnvFileContent: (value: string) => void;
	setHeadSha: (value: string) => void;
	setIsLoaded: (value: boolean) => void;
	setShowEditor: (value: boolean) => void;
	setLoadError: (value: string) => void;
}) {
	return useCallback(
		async (nextComposePath?: string) => {
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
		},
		[
			branch,
			composePath,
			envPath,
			installationId,
			selectedRepository,
			setComposePath,
			setComposeYaml,
			setEnvFileContent,
			setHeadSha,
			setIsLoaded,
			setLoadError,
			setShowEditor,
			startTransition,
		],
	);
}
