import {
	downloadRepositoryTarball,
	fetchRepositoryTextFile,
	getInstallationProviderConfigByInternalInstallationId,
	getRepositoryBranchHeadSha,
} from "@/lib/github-app";

export async function materializeGitHubStackSource(input: {
	githubInstallationId: string;
	owner: string;
	repository: string;
	branch: string;
	composePath: string;
	envPath?: string;
	provider?: Awaited<ReturnType<typeof getInstallationProviderConfigByInternalInstallationId>>;
}) {
	const compose = await fetchRepositoryTextFile({
		installationId: input.githubInstallationId,
		owner: input.owner,
		repository: input.repository,
		path: input.composePath,
		ref: input.branch,
		provider: input.provider || undefined,
	});
	const envFile = input.envPath
		? await fetchRepositoryTextFile({
				installationId: input.githubInstallationId,
				owner: input.owner,
				repository: input.repository,
				path: input.envPath,
				ref: input.branch,
				provider: input.provider || undefined,
			})
		: null;
	const headSha = await getRepositoryBranchHeadSha({
		installationId: input.githubInstallationId,
		owner: input.owner,
		repository: input.repository,
		branch: input.branch,
		provider: input.provider || undefined,
	});

	return {
		composeYaml: compose.text,
		envFileContent: envFile?.text ?? null,
		sourceCommitSha: headSha,
	};
}

export async function resolveGitHubDeploymentSource(
	stack: {
		sourceType: "manual" | "github";
		githubInstallation: { id: string; githubInstallationId: string } | null;
		githubOwner: string | null;
		githubRepository: string | null;
		githubBranch: string | null;
	},
	options?: { includeArchive?: boolean },
) {
	if (stack.sourceType !== "github") {
		return {
			sourceCommitSha: null,
			sourceArchive: null,
		};
	}

	if (
		!stack.githubInstallation ||
		!stack.githubOwner ||
		!stack.githubRepository ||
		!stack.githubBranch
	) {
		throw new Error("GitHub stack is missing repository metadata required for source builds.");
	}

	const provider = await getInstallationProviderConfigByInternalInstallationId(
		stack.githubInstallation.id,
	);
	const sourceCommitSha = await getRepositoryBranchHeadSha({
		installationId: stack.githubInstallation.githubInstallationId,
		owner: stack.githubOwner,
		repository: stack.githubRepository,
		branch: stack.githubBranch,
		provider: provider || undefined,
	});

	return {
		sourceCommitSha,
		sourceArchive: options?.includeArchive
			? await downloadRepositoryTarball({
					installationId: stack.githubInstallation.githubInstallationId,
					owner: stack.githubOwner,
					repository: stack.githubRepository,
					ref: sourceCommitSha,
					provider: provider || undefined,
				})
			: null,
	};
}
