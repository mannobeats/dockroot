import { db, deployments } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import {
	downloadRepositoryTarball,
	getInstallationProviderConfigByInternalInstallationId,
} from "@/lib/github-app";
import { heartbeatAgent } from "./auth";

export async function getDeploymentSourceArchive({
	deploymentId,
	accessToken,
}: {
	deploymentId: string;
	accessToken: string;
}) {
	const agent = await heartbeatAgent(accessToken);
	const deployment = await db.query.deployments.findFirst({
		where: and(
			eq(deployments.id, deploymentId),
			eq(deployments.environmentId, agent.environmentId),
		),
		with: {
			stack: {
				with: {
					githubInstallation: true,
				},
			},
		},
	});

	if (!deployment) {
		throw new Error("Deployment not found");
	}

	if (!deployment.stack) {
		throw new Error("Deployment references a deleted stack.");
	}

	if (deployment.stack.sourceType !== "github") {
		throw new Error("This deployment does not have a GitHub source archive.");
	}

	if (
		!deployment.stack.githubInstallation ||
		!deployment.stack.githubOwner ||
		!deployment.stack.githubRepository ||
		!deployment.sourceCommitSha
	) {
		throw new Error("GitHub deployment is missing repository metadata.");
	}

	return downloadRepositoryTarball({
		installationId: deployment.stack.githubInstallation.githubInstallationId,
		owner: deployment.stack.githubOwner,
		repository: deployment.stack.githubRepository,
		ref: deployment.sourceCommitSha,
		provider:
			(await getInstallationProviderConfigByInternalInstallationId(
				deployment.stack.githubInstallation.id,
			)) || undefined,
	});
}
