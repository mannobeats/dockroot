import { db, deployments, stacks } from "@dockroot/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	downloadRepositoryTarball,
	getInstallationProviderConfigByInternalInstallationId,
} from "@/lib/github-app";
import { emitRealtime, emitToRoom } from "@/lib/realtime";
import { now } from "../shared";
import { heartbeatAgent } from "./auth";

export async function claimNextDeployment(accessToken: string) {
	const agent = await heartbeatAgent(accessToken);

	const queued = await db.query.deployments.findFirst({
		where: and(
			eq(deployments.environmentId, agent.environmentId),
			eq(deployments.status, "queued"),
		),
		orderBy: [desc(deployments.createdAt)],
		with: {
			stack: true,
		},
	});

	if (!queued) {
		return null;
	}

	const updatedAt = now();

	await db
		.update(deployments)
		.set({
			status: "running",
			claimedAt: updatedAt,
			startedAt: updatedAt,
			updatedAt,
		})
		.where(and(eq(deployments.id, queued.id), eq(deployments.status, "queued")));

	if (queued.stackId) {
		await db
			.update(stacks)
			.set({
				status: "deploying",
				updatedAt,
			})
			.where(eq(stacks.id, queued.stackId));
	}

	emitRealtime("deployment:update", {
		stackId: queued.stackId,
		deploymentId: queued.id,
		status: "running",
		environmentId: agent.environmentId,
		at: Date.now(),
	});

	if (!queued.stack) {
		throw new Error("Deployment references a deleted stack and cannot be claimed.");
	}

	return {
		id: queued.id,
		stackSlug: queued.stack.slug,
		stackName: queued.stack.name,
		sourceType: queued.stack.sourceType,
		operation: queued.operation,
		composeYaml: queued.composeSnapshot,
		envFileContent: queued.envSnapshot,
		composePath: queued.stack.githubPath,
		envPath: queued.stack.githubEnvPath,
		sourceCommitSha: queued.sourceCommitSha,
	};
}

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

export async function completeDeployment({
	deploymentId,
	accessToken,
	status,
	log,
}: {
	deploymentId: string;
	accessToken: string;
	status: "succeeded" | "failed";
	log: string;
}) {
	const agent = await heartbeatAgent(accessToken);

	const deployment = await db.query.deployments.findFirst({
		where: and(
			eq(deployments.id, deploymentId),
			eq(deployments.environmentId, agent.environmentId),
		),
		with: {
			stack: true,
		},
	});

	if (!deployment) {
		throw new Error("Deployment not found");
	}

	const updatedAt = now();

	await db
		.update(deployments)
		.set({
			status,
			log,
			summary: status === "succeeded" ? "Deployment completed successfully." : "Deployment failed.",
			finishedAt: updatedAt,
			updatedAt,
		})
		.where(eq(deployments.id, deployment.id));

	if (deployment.stackId) {
		await db
			.update(stacks)
			.set({
				status:
					status === "succeeded"
						? deployment.operation === "destroy"
							? "stopped"
							: "running"
						: "failed",
				lastDeployedAt: updatedAt,
				updatedAt,
			})
			.where(eq(stacks.id, deployment.stackId));
	}

	emitToRoom(`stack:${deployment.stackId}`, "deployment:complete", {
		stackId: deployment.stackId,
		deploymentId,
		status,
		at: Date.now(),
	});
	emitRealtime("deployment:update", {
		stackId: deployment.stackId,
		deploymentId,
		status,
		environmentId: deployment.environmentId,
		at: Date.now(),
	});

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/stacks");
	revalidatePath(`/dashboard/stacks/${deployment.stackId}`);
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${deployment.environmentId}`);
}

export async function appendDeploymentLogEvents({
	deploymentId,
	accessToken,
	events,
}: {
	deploymentId: string;
	accessToken: string;
	events: Array<{
		stream?: "stdout" | "stderr";
		message?: string;
		at?: number;
	}>;
}) {
	if (!events.length) {
		return;
	}

	const agent = await heartbeatAgent(accessToken);
	const deployment = await db.query.deployments.findFirst({
		where: and(
			eq(deployments.id, deploymentId),
			eq(deployments.environmentId, agent.environmentId),
		),
		with: {
			stack: {
				columns: {
					id: true,
				},
			},
		},
	});

	if (!deployment) {
		throw new Error("Deployment not found");
	}

	const combinedLog = events
		.map((event) => String(event.message || ""))
		.filter(Boolean)
		.join("");
	if (!combinedLog) {
		return;
	}

	const updatedAt = now();
	await db
		.update(deployments)
		.set({
			log: sql`coalesce(${deployments.log}, '') || ${combinedLog}`,
			updatedAt,
		})
		.where(eq(deployments.id, deployment.id));

	for (const event of events) {
		emitToRoom(`stack:${deployment.stackId}`, "stack:log", {
			stackId: deployment.stackId,
			deploymentId,
			stream: event.stream === "stderr" ? "stderr" : "stdout",
			message: String(event.message || ""),
			at: Number(event.at || Date.now()),
		});
	}
}
