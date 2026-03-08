import "server-only";

import { agents, db, deployments, environments, projects, stacks } from "@dockroot/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { deployStackLocally, getLocalDockerSnapshot } from "@/lib/platform/docker";
import { getPlatformDataDir } from "@/lib/platform/fs";
import { publicEnv } from "@/lib/public-env";
import { emitRealtime, emitToRoom } from "@/lib/realtime";

function now() {
	return new Date();
}

export function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

function randomToken(length = 32) {
	return crypto.randomUUID().replaceAll("-", "").slice(0, length);
}

async function ensureUniqueProjectSlug(baseValue: string) {
	const baseSlug = slugify(baseValue) || `item-${randomToken(8)}`;
	let slug = baseSlug;
	let attempt = 1;

	while (true) {
		const existing = await db.query.projects.findFirst({
			where: eq(projects.slug, slug),
			columns: { id: true },
		});

		if (!existing) {
			return slug;
		}

		attempt += 1;
		slug = `${baseSlug}-${attempt}`;
	}
}

async function ensureUniqueEnvironmentSlug(baseValue: string) {
	const baseSlug = slugify(baseValue) || `environment-${randomToken(8)}`;
	let slug = baseSlug;
	let attempt = 1;

	while (true) {
		const existing = await db.query.environments.findFirst({
			where: eq(environments.slug, slug),
			columns: { id: true },
		});

		if (!existing) {
			return slug;
		}

		attempt += 1;
		slug = `${baseSlug}-${attempt}`;
	}
}

async function ensureUniqueStackSlug(baseValue: string) {
	const baseSlug = slugify(baseValue) || `stack-${randomToken(8)}`;
	let slug = baseSlug;
	let attempt = 1;

	while (true) {
		const existing = await db.query.stacks.findFirst({
			where: eq(stacks.slug, slug),
			columns: { id: true },
		});

		if (!existing) {
			return slug;
		}

		attempt += 1;
		slug = `${baseSlug}-${attempt}`;
	}
}

export async function ensureDefaultLocalEnvironment(userId: string) {
	const existing = await db.query.environments.findFirst({
		where: and(eq(environments.createdByUserId, userId), eq(environments.isDefaultLocal, true)),
		with: {
			agent: true,
		},
	});

	if (existing) {
		return existing;
	}

	const environmentId = crypto.randomUUID();
	const agentId = crypto.randomUUID();
	const createdAt = now();

	await db.insert(environments).values({
		id: environmentId,
		name: "Local Docker",
		slug: `local-docker-${userId.slice(0, 8)}`,
		description: "Built-in manager host for instant compose deployments.",
		kind: "local",
		status: "healthy",
		isDefaultLocal: true,
		managerUrl: publicEnv.appUrl,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	await db.insert(agents).values({
		id: agentId,
		environmentId,
		hostname: "manager-host",
		operatingSystem: process.platform,
		architecture: process.arch,
		dockerVersion: "manager-local",
		status: "healthy",
		registrationToken: randomToken(40),
		accessToken: randomToken(48),
		lastSeenAt: createdAt,
		installedAt: createdAt,
		createdAt,
		updatedAt: createdAt,
	});

	return db.query.environments.findFirst({
		where: eq(environments.id, environmentId),
		with: {
			agent: true,
		},
	});
}

export async function getDashboardData(userId: string) {
	await ensureDefaultLocalEnvironment(userId);

	const [projectCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(projects)
		.where(eq(projects.createdByUserId, userId));
	const [environmentCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(environments)
		.where(eq(environments.createdByUserId, userId));
	const [stackCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(stacks)
		.where(eq(stacks.createdByUserId, userId));
	const [deploymentCount] = await db
		.select({ count: sql<number>`count(*)` })
		.from(deployments)
		.leftJoin(stacks, eq(deployments.stackId, stacks.id))
		.where(eq(stacks.createdByUserId, userId));

	const recentDeployments = await db.query.deployments.findMany({
		orderBy: [desc(deployments.createdAt)],
		limit: 8,
		with: {
			stack: {
				columns: {
					id: true,
					name: true,
					slug: true,
				},
			},
			environment: {
				columns: {
					id: true,
					name: true,
					slug: true,
				},
			},
		},
	});

	const recentProjects = await db.query.projects.findMany({
		where: eq(projects.createdByUserId, userId),
		orderBy: [desc(projects.updatedAt)],
		limit: 4,
		with: {
			stacks: {
				columns: {
					id: true,
					name: true,
					status: true,
				},
			},
		},
	});

	const runtime = await getLocalDockerSnapshot();

	return {
		projectCount: Number(projectCount?.count ?? 0),
		environmentCount: Number(environmentCount?.count ?? 0),
		stackCount: Number(stackCount?.count ?? 0),
		deploymentCount: Number(deploymentCount?.count ?? 0),
		recentDeployments,
		recentProjects,
		runtime,
		dataDir: getPlatformDataDir(),
	};
}

export async function listProjects(userId: string) {
	await ensureDefaultLocalEnvironment(userId);

	return db.query.projects.findMany({
		where: eq(projects.createdByUserId, userId),
		orderBy: [desc(projects.updatedAt)],
		with: {
			stacks: {
				orderBy: [desc(stacks.updatedAt)],
				with: {
					environment: true,
				},
			},
		},
	});
}

export async function listEnvironments(userId: string) {
	await ensureDefaultLocalEnvironment(userId);

	return db.query.environments.findMany({
		where: eq(environments.createdByUserId, userId),
		orderBy: [desc(environments.updatedAt)],
		with: {
			agent: true,
			stacks: true,
		},
	});
}

export async function listDeployments(userId: string) {
	await ensureDefaultLocalEnvironment(userId);

	return db.query.deployments.findMany({
		orderBy: [desc(deployments.createdAt)],
		limit: 25,
		with: {
			stack: true,
			environment: true,
		},
	});
}

export async function getProjectById(projectId: string, userId: string) {
	return db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.createdByUserId, userId)),
		with: {
			stacks: {
				orderBy: [desc(stacks.updatedAt)],
				with: {
					environment: true,
					deployments: {
						orderBy: [desc(deployments.createdAt)],
						limit: 5,
					},
				},
			},
		},
	});
}

export async function getStackById({
	stackId,
	projectId,
	userId,
}: {
	stackId: string;
	projectId: string;
	userId: string;
}) {
	return db.query.stacks.findFirst({
		where: and(
			eq(stacks.id, stackId),
			eq(stacks.projectId, projectId),
			eq(stacks.createdByUserId, userId),
		),
		with: {
			project: true,
			environment: true,
			deployments: {
				orderBy: [desc(deployments.createdAt)],
				limit: 20,
			},
		},
	});
}

export async function getEnvironmentById(environmentId: string, userId: string) {
	return db.query.environments.findFirst({
		where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
		with: {
			agent: true,
			stacks: {
				orderBy: [desc(stacks.updatedAt)],
			},
			deployments: {
				orderBy: [desc(deployments.createdAt)],
				limit: 10,
				with: {
					stack: true,
				},
			},
		},
	});
}

export async function createProject({
	userId,
	name,
	description,
}: {
	userId: string;
	name: string;
	description?: string;
}) {
	const createdAt = now();
	const slug = await ensureUniqueProjectSlug(name);

	await db.insert(projects).values({
		id: crypto.randomUUID(),
		name,
		slug,
		description: description?.trim() || null,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/projects");
}

export async function createEnvironment({
	userId,
	name,
	description,
	managerUrl,
}: {
	userId: string;
	name: string;
	description?: string;
	managerUrl?: string;
}) {
	const createdAt = now();
	const environmentId = crypto.randomUUID();
	const slug = await ensureUniqueEnvironmentSlug(name);

	await db.insert(environments).values({
		id: environmentId,
		name,
		slug,
		description: description?.trim() || null,
		kind: "agent",
		status: "provisioning",
		managerUrl: managerUrl?.trim() || publicEnv.appUrl,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	await db.insert(agents).values({
		id: crypto.randomUUID(),
		environmentId,
		status: "provisioning",
		registrationToken: randomToken(48),
		createdAt,
		updatedAt: createdAt,
	});

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/environments");
}

export async function createStack({
	userId,
	projectId,
	environmentId,
	name,
	description,
	composeYaml,
	envFileContent,
}: {
	userId: string;
	projectId: string;
	environmentId: string;
	name: string;
	description?: string;
	composeYaml: string;
	envFileContent?: string;
}) {
	const createdAt = now();
	const slug = await ensureUniqueStackSlug(name);

	await db.insert(stacks).values({
		id: crypto.randomUUID(),
		projectId,
		environmentId,
		name,
		slug,
		description: description?.trim() || null,
		sourceType: "manual",
		status: "draft",
		composeYaml,
		envFileContent: envFileContent?.trim() || null,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/projects");
	revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function queueOrRunDeployment({
	stackId,
	userId,
	operation = "deploy",
}: {
	stackId: string;
	userId: string;
	operation?: "deploy" | "destroy";
}) {
	const stack = await db.query.stacks.findFirst({
		where: and(eq(stacks.id, stackId), eq(stacks.createdByUserId, userId)),
		with: {
			environment: {
				with: {
					agent: true,
				},
			},
			project: true,
		},
	});

	if (!stack) {
		throw new Error("Stack not found");
	}

	const createdAt = now();
	const deploymentId = crypto.randomUUID();
	const version = `${createdAt.getUTCFullYear()}.${String(createdAt.getUTCMonth() + 1).padStart(2, "0")}.${String(createdAt.getUTCDate()).padStart(2, "0")}-${createdAt.getTime()}`;

	await db.insert(deployments).values({
		id: deploymentId,
		stackId: stack.id,
		environmentId: stack.environmentId,
		initiatedByUserId: userId,
		operation,
		version,
		status: stack.environment.kind === "local" ? "running" : "queued",
		composeSnapshot: stack.composeYaml,
		envSnapshot: stack.envFileContent,
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
			composeYaml: stack.composeYaml,
			envFileContent: stack.envFileContent,
			operation,
		});
	}

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/projects");
	revalidatePath(`/dashboard/projects/${stack.projectId}`);
	revalidatePath(`/dashboard/projects/${stack.projectId}/stacks/${stack.id}`);
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${stack.environmentId}`);
}

export async function getAgentInstallContext(registrationToken: string) {
	return db.query.agents.findFirst({
		where: eq(agents.registrationToken, registrationToken),
		with: {
			environment: true,
		},
	});
}

export async function registerAgent({
	registrationToken,
	hostname,
	operatingSystem,
	architecture,
	dockerVersion,
}: {
	registrationToken: string;
	hostname?: string;
	operatingSystem?: string;
	architecture?: string;
	dockerVersion?: string;
}) {
	const agent = await db.query.agents.findFirst({
		where: eq(agents.registrationToken, registrationToken),
		with: {
			environment: true,
		},
	});

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
			lastSeenAt: updatedAt,
			installedAt: agent.installedAt ?? updatedAt,
			updatedAt,
		})
		.where(eq(agents.id, agent.id));

	await db
		.update(environments)
		.set({
			status: "healthy",
			updatedAt,
		})
		.where(eq(environments.id, agent.environmentId));

	return {
		agentId: agent.id,
		environmentId: agent.environmentId,
		accessToken,
		managerUrl: agent.environment.managerUrl || publicEnv.appUrl,
	};
}

export async function heartbeatAgent(accessToken: string) {
	const agent = await db.query.agents.findFirst({
		where: eq(agents.accessToken, accessToken),
	});

	if (!agent) {
		throw new Error("Invalid agent token");
	}

	const updatedAt = now();

	await db
		.update(agents)
		.set({
			status: "healthy",
			lastSeenAt: updatedAt,
			updatedAt,
		})
		.where(eq(agents.id, agent.id));

	await db
		.update(environments)
		.set({
			status: "healthy",
			updatedAt,
		})
		.where(eq(environments.id, agent.environmentId));

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

	await db
		.update(stacks)
		.set({
			status: "deploying",
			updatedAt,
		})
		.where(eq(stacks.id, queued.stackId));

	return {
		id: queued.id,
		stackSlug: queued.stack.slug,
		stackName: queued.stack.name,
		operation: queued.operation,
		composeYaml: queued.composeSnapshot,
		envFileContent: queued.envSnapshot,
	};
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

	await db
		.update(stacks)
		.set({
			status: status === "succeeded" ? "running" : "failed",
			lastDeployedAt: updatedAt,
			updatedAt,
		})
		.where(eq(stacks.id, deployment.stackId));

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
	revalidatePath("/dashboard/projects");
	revalidatePath(`/dashboard/projects/${deployment.stack.projectId}`);
	revalidatePath(`/dashboard/projects/${deployment.stack.projectId}/stacks/${deployment.stackId}`);
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${deployment.environmentId}`);
}

export async function getInstallCommand(environmentId: string, userId: string) {
	const environment = await db.query.environments.findFirst({
		where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
		with: { agent: true },
	});

	if (!environment?.agent[0]) {
		throw new Error("Environment not found");
	}

	const scriptUrl = `${publicEnv.appUrl.replace(/\/$/, "")}/api/agent/install/${environment.agent[0].registrationToken}`;

	return {
		quickInstall: `curl -fsSL ${scriptUrl} | sudo bash`,
		downloadInstall: `curl -fsSL ${scriptUrl} -o dockroot-agent-install.sh && sudo bash dockroot-agent-install.sh`,
	};
}

export async function listRuntimeResources() {
	return getLocalDockerSnapshot();
}

export async function getGlobalSettings(userId: string) {
	await ensureDefaultLocalEnvironment(userId);

	const environmentsList = await listEnvironments(userId);
	const projectsList = await listProjects(userId);

	return {
		managerUrl: publicEnv.appUrl,
		dataDir: getPlatformDataDir(),
		environments: environmentsList.length,
		projects: projectsList.length,
	};
}

export async function getPendingDeploymentById(id: string) {
	return db.query.deployments.findFirst({
		where: and(eq(deployments.id, id), isNull(deployments.finishedAt)),
	});
}
