import { db, deployments, stacks } from "@dockroot/db";
import { and, desc, eq } from "drizzle-orm";
import { emitRealtime } from "@/lib/realtime";
import { now } from "../shared";
import { heartbeatAgent } from "./auth";

export * from "./jobs-complete";
export * from "./jobs-logs";
export * from "./jobs-source";

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
