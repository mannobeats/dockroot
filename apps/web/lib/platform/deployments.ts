import { db, deployments, environments, stacks } from "@dockroot/db";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { deployStackLocally } from "@/lib/platform/docker";
import { emitRealtime } from "@/lib/realtime";
import { ensureDefaultLocalEnvironment } from "./environments";
import { resolveGitHubDeploymentSource } from "./github-source";
import { now } from "./shared";

export async function listDeployments(
	userId: string,
	limit = 50,
	options?: { environmentId?: string },
) {
	await ensureDefaultLocalEnvironment(userId);

	const ownedStacks = await db.query.stacks.findMany({
		where: eq(stacks.createdByUserId, userId),
		columns: { id: true },
	});
	const stackIds = ownedStacks.map((stack) => stack.id);

	const ownedEnvironments = await db.query.environments.findMany({
		where: eq(environments.createdByUserId, userId),
		columns: { id: true },
	});
	const environmentIds = ownedEnvironments.map((e) => e.id);

	const conditions = [];
	if (stackIds.length) conditions.push(inArray(deployments.stackId, stackIds));
	if (options?.environmentId) {
		conditions.push(eq(deployments.environmentId, options.environmentId));
	} else if (environmentIds.length) {
		conditions.push(inArray(deployments.environmentId, environmentIds));
	}
	conditions.push(eq(deployments.initiatedByUserId, userId));

	return db.query.deployments.findMany({
		where: or(...conditions),
		orderBy: [desc(deployments.createdAt)],
		limit: Math.max(1, Math.min(200, limit)),
		with: {
			stack: true,
			environment: true,
			initiatedBy: true,
		},
	});
}

export async function queueOrRunDeployment({
	stackId,
	userId,
	operation = "deploy",
	webhookDeliveryId,
}: {
	stackId: string;
	userId: string;
	operation?: "deploy" | "destroy";
	webhookDeliveryId?: string | null;
}) {
	const stack = await db.query.stacks.findFirst({
		where: and(eq(stacks.id, stackId), eq(stacks.createdByUserId, userId)),
		with: {
			githubInstallation: true,
			environment: {
				with: {
					agent: true,
				},
			},
		},
	});

	if (!stack) {
		throw new Error("Stack not found");
	}

	const createdAt = now();
	const deploymentId = crypto.randomUUID();
	const version = `${createdAt.getUTCFullYear()}.${String(createdAt.getUTCMonth() + 1).padStart(2, "0")}.${String(createdAt.getUTCDate()).padStart(2, "0")}-${createdAt.getTime()}`;
	const composeSnapshot = stack.composeYaml;
	const envSnapshot = stack.envFileContent;
	const gitHubSource =
		operation === "deploy"
			? await resolveGitHubDeploymentSource(stack, {
					includeArchive: stack.environment.kind === "local",
				})
			: { sourceCommitSha: null, sourceArchive: null };

	await db.insert(deployments).values({
		id: deploymentId,
		stackId: stack.id,
		environmentId: stack.environmentId,
		stackName: stack.name,
		environmentName: stack.environment.name,
		initiatedByUserId: userId,
		operation,
		version,
		status: stack.environment.kind === "local" ? "running" : "queued",
		composeSnapshot,
		envSnapshot,
		sourceCommitSha: gitHubSource.sourceCommitSha,
		webhookDeliveryId: webhookDeliveryId || null,
		startedAt: stack.environment.kind === "local" ? createdAt : null,
		createdAt,
		updatedAt: createdAt,
	});

	await db
		.update(stacks)
		.set({
			status: stack.environment.kind === "local" ? "deploying" : "queued",
			updatedAt: createdAt,
		})
		.where(eq(stacks.id, stack.id));

	emitRealtime("deployment:update", {
		stackId: stack.id,
		deploymentId,
		status: stack.environment.kind === "local" ? "deploying" : "queued",
		environmentId: stack.environmentId,
		at: Date.now(),
	});

	if (stack.environment.kind === "local") {
		await deployStackLocally({
			deploymentId,
			stackId: stack.id,
			stackSlug: stack.slug,
			sourceType: stack.sourceType,
			composeYaml: composeSnapshot,
			envFileContent: envSnapshot,
			sourceArchive: gitHubSource.sourceArchive,
			composeFilePath: stack.githubPath || undefined,
			envFilePath: stack.githubEnvPath || undefined,
			operation,
		});
	}

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/stacks");
	revalidatePath(`/dashboard/stacks/${stack.id}`);
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${stack.environmentId}`);
}

export async function getPendingDeploymentById(id: string) {
	return db.query.deployments.findFirst({
		where: and(eq(deployments.id, id), isNull(deployments.finishedAt)),
	});
}
