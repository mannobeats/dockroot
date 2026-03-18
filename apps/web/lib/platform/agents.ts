import { agents, db, deployments, environments, stacks } from "@dockroot/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	downloadRepositoryTarball,
	getInstallationProviderConfigByInternalInstallationId,
} from "@/lib/github-app";
import { resolveManagerUrl } from "@/lib/manager-url";
import { getLocalDockerSnapshot } from "@/lib/platform/docker";
import { publicEnv } from "@/lib/public-env";
import { emitRealtime, emitToRoom } from "@/lib/realtime";
import { persistRuntimeSnapshotMetrics } from "@/lib/runtime-metrics";
import { deriveRegisteredManagerUrl } from "./environments";
import {
	findAgentByAccessToken,
	findAgentByRegistrationToken,
	getStoredManagerUrl,
	issueRegistrationToken,
} from "./queries";
import {
	AGENT_IMAGE,
	AGENT_PORT,
	emitEnvironmentUpdate,
	hashToken,
	now,
	randomToken,
	resolveStoredAgentRuntimeUrl,
} from "./shared";

export async function registerAgent({
	registrationToken,
	hostname,
	operatingSystem,
	architecture,
	dockerVersion,
	agentUrl,
	managerUrl,
}: {
	registrationToken: string;
	hostname?: string;
	operatingSystem?: string;
	architecture?: string;
	dockerVersion?: string;
	agentUrl?: string;
	managerUrl?: string;
}) {
	const agent = await findAgentByRegistrationToken(registrationToken);

	if (!agent) {
		throw new Error("Invalid registration token");
	}

	const updatedAt = now();
	const accessToken = randomToken(64);

	await db
		.update(agents)
		.set({
			hostname: hostname || agent.hostname,
			operatingSystem: operatingSystem || agent.operatingSystem,
			architecture: architecture || agent.architecture,
			dockerVersion: dockerVersion || agent.dockerVersion,
			status: "healthy",
			accessToken,
			registrationToken: hashToken(randomToken(48)),
			lastSeenAt: updatedAt,
			installedAt: agent.installedAt ?? updatedAt,
			updatedAt,
		})
		.where(eq(agents.id, agent.id));

	await db
		.update(environments)
		.set({
			status: "healthy",
			managerUrl: deriveRegisteredManagerUrl({
				currentUrl: agent.environment.managerUrl,
				inferredUrl: agentUrl,
				hostname: hostname || agent.hostname,
			}),
			updatedAt,
		})
		.where(eq(environments.id, agent.environmentId));

	emitEnvironmentUpdate(agent.environmentId, "healthy");

	return {
		agentId: agent.id,
		environmentId: agent.environmentId,
		accessToken,
		managerUrl:
			resolveManagerUrl({
				configuredUrl: managerUrl || null,
			}) || publicEnv.appUrl,
	};
}

export async function heartbeatAgent(
	accessToken: string,
	snapshot?: Parameters<typeof persistRuntimeSnapshotMetrics>[0]["snapshot"],
	agentUrl?: string,
) {
	const agent = await findAgentByAccessToken(accessToken);

	if (!agent) {
		throw new Error("Invalid agent token");
	}

	const updatedAt = now();

	await db
		.update(agents)
		.set({
			accessToken,
			status: "healthy",
			lastSeenAt: updatedAt,
			updatedAt,
		})
		.where(eq(agents.id, agent.id));

	await db
		.update(environments)
		.set({
			status: "healthy",
			managerUrl: resolveStoredAgentRuntimeUrl({
				currentUrl: agent.environment.managerUrl,
				inferredUrl: agentUrl,
				hostname: agent.hostname,
			}),
			updatedAt,
		})
		.where(eq(environments.id, agent.environmentId));

	emitEnvironmentUpdate(agent.environmentId, "healthy");

	if (snapshot) {
		await persistRuntimeSnapshotMetrics({
			environmentId: agent.environmentId,
			snapshot,
			source: "agent",
		});

		emitRealtime("runtime:metrics", {
			environmentId: agent.environmentId,
			at: Date.now(),
			containers: snapshot.containerStats || [],
			host: {
				source: "native",
				cpuPercent: snapshot.usage?.cpuPercent ?? null,
				memoryPercent: snapshot.usage?.memoryPercent ?? null,
			},
		});
	}

	return agent;
}

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

export async function getInstallCommand(
	environmentId: string,
	userId: string,
	options?: { managerUrl?: string | null },
) {
	const environment = await db.query.environments.findFirst({
		where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
		with: { agent: true },
	});

	if (!environment?.agent[0]) {
		throw new Error("Environment not found");
	}

	const registrationToken = await issueRegistrationToken(environment.agent[0].id);
	const configuredManagerUrl = await getStoredManagerUrl(userId);
	const managerUrl = resolveManagerUrl({
		configuredUrl: configuredManagerUrl,
		requestManagerUrl: options?.managerUrl || null,
	});
	const dataVolumeName = `dockroot_agent_data_${environment.slug.replace(/-/g, "_")}`;
	const dockerRun = [
		"docker run -d \\",
		`  --name dockroot-agent-${environment.slug} \\`,
		"  --user root \\",
		"  --restart unless-stopped \\",
		"  -v /var/run/docker.sock:/var/run/docker.sock \\",
		`  -v ${dataVolumeName}:/var/lib/dockroot-agent \\`,
		`  -p ${AGENT_PORT}:${AGENT_PORT} \\`,
		`  -e DOCKROOT_MANAGER_URL=${managerUrl} \\`,
		`  -e DOCKROOT_AGENT_REGISTRATION_TOKEN=${registrationToken} \\`,
		`  -e DOCKROOT_AGENT_PORT=${AGENT_PORT} \\`,
		`  ${AGENT_IMAGE}`,
	].join("\n");
	const dockerCompose = [
		"services:",
		"  dockroot-agent:",
		`    image: ${AGENT_IMAGE}`,
		`    container_name: dockroot-agent-${environment.slug}`,
		"    user: root",
		"    restart: unless-stopped",
		"    environment:",
		`      DOCKROOT_MANAGER_URL: ${managerUrl}`,
		`      DOCKROOT_AGENT_REGISTRATION_TOKEN: ${registrationToken}`,
		`      DOCKROOT_AGENT_PORT: ${AGENT_PORT}`,
		"      DOCKROOT_AGENT_DATA_DIR: /var/lib/dockroot-agent",
		"    volumes:",
		"      - /var/run/docker.sock:/var/run/docker.sock",
		`      - ${dataVolumeName}:/var/lib/dockroot-agent`,
		"    ports:",
		`      - "${AGENT_PORT}:${AGENT_PORT}"`,
		"",
		"volumes:",
		`  ${dataVolumeName}:`,
	].join("\n");

	return {
		registrationToken,
		managerUrl,
		dockerRun,
		dockerCompose,
		legacyInstallScript: `${managerUrl}/api/agent/install/${environment.id}`,
	};
}

export async function rotateAgentRegistrationToken({
	environmentId,
	userId,
}: {
	environmentId: string;
	userId: string;
}) {
	const environment = await db.query.environments.findFirst({
		where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
		with: {
			agent: true,
		},
	});

	if (!environment?.agent[0]) {
		throw new Error("Environment not found");
	}

	await issueRegistrationToken(environment.agent[0].id);
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${environment.id}`);
}

export async function listRuntimeResources() {
	return getLocalDockerSnapshot();
}
