import { db, githubInstallations, stacks } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	getInstallationProviderConfigByInternalInstallationId,
	getRepositoryBranchHeadSha,
} from "@/lib/github-app";
import { materializeGitHubStackSource } from "../github-source";
import { ensureUniqueStackSlug, requireOwnedEnvironment } from "../queries";
import { now } from "../shared";

export async function createGitHubStack({
	userId,
	environmentId,
	name,
	description,
	installationId,
	repositoryId,
	owner,
	repository,
	branch,
	composePath,
	envPath,
	composeYaml,
	envFileContent,
	autoDeployEnabled = true,
	autoDeployPaths,
}: {
	userId: string;
	environmentId: string;
	name: string;
	description?: string;
	installationId: string;
	repositoryId?: string;
	owner: string;
	repository: string;
	branch: string;
	composePath: string;
	envPath?: string;
	composeYaml?: string;
	envFileContent?: string;
	autoDeployEnabled?: boolean;
	autoDeployPaths?: string | null;
}) {
	await requireOwnedEnvironment(environmentId, userId);

	const installation = await db.query.githubInstallations.findFirst({
		where: and(
			eq(githubInstallations.id, installationId),
			eq(githubInstallations.createdByUserId, userId),
		),
	});

	if (!installation) {
		throw new Error("GitHub installation not found");
	}
	const provider = await getInstallationProviderConfigByInternalInstallationId(installation.id);

	const source = composeYaml?.trim()
		? {
				composeYaml: composeYaml.trim(),
				envFileContent: envFileContent?.trim() || null,
				sourceCommitSha: await getRepositoryBranchHeadSha({
					installationId: installation.githubInstallationId,
					owner,
					repository,
					branch,
					provider: provider || undefined,
				}),
			}
		: await materializeGitHubStackSource({
				githubInstallationId: installation.githubInstallationId,
				owner,
				repository,
				branch,
				composePath,
				envPath,
				provider: provider || undefined,
			});
	const createdAt = now();
	const slug = await ensureUniqueStackSlug(name);

	await db.insert(stacks).values({
		id: crypto.randomUUID(),
		environmentId,
		name,
		slug,
		description: description?.trim() || null,
		sourceType: "github",
		status: "draft",
		composeYaml: source.composeYaml,
		composeFileName: composePath.split("/").at(-1) || "compose.yaml",
		envFileContent: source.envFileContent,
		envFileName: envPath?.split("/").at(-1) || ".env",
		githubInstallationId: installation.id,
		githubRepositoryId: repositoryId || null,
		githubOwner: owner,
		githubRepository: repository,
		githubBranch: branch,
		githubPath: composePath,
		githubEnvPath: envPath || null,
		autoDeployEnabled,
		autoDeployPaths: autoDeployPaths?.trim() || null,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/stacks");
}
