import "server-only";

import { createHash } from "node:crypto";
import {
	agents,
	db,
	deployments,
	environments,
	githubInstallations,
	projects,
	stacks,
} from "@dockroot/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	downloadRepositoryTarball,
	fetchRepositoryTextFile,
	getGitHubInstallation,
	getRepositoryBranchHeadSha,
	listGitHubAppInstallations,
	listInstallationRepositories,
} from "@/lib/github-app";
import { incrementDeploymentEvent } from "@/lib/monitoring";
import {
	deleteLocalStackResources,
	deployStackLocally,
	exportComposeProjectConfig,
	getLocalDockerSnapshot,
	listComposeProjects,
	listContainers,
} from "@/lib/platform/docker";
import { getPlatformDataDir } from "@/lib/platform/fs";
import { publicEnv } from "@/lib/public-env";
import { emitRealtime, emitToRoom } from "@/lib/realtime";

function now() {
	return new Date();
}

const AGENT_IMAGE = "ghcr.io/mannobeats/dockroot-agent:latest";
const AGENT_PORT = 9095;

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

function hashToken(token: string) {
	return createHash("sha256").update(`${getRequiredTokenPepper()}:${token}`).digest("hex");
}

function getRequiredTokenPepper() {
	return process.env.DOCKROOT_TOKEN_PEPPER || process.env.BETTER_AUTH_SECRET || "";
}

function normalizeAgentUrl(value: string | undefined) {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error("Agent URL must be a valid absolute URL.");
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error("Agent URL must use http or https.");
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.search ||
		parsed.hash ||
		parsed.pathname !== "/"
	) {
		throw new Error("Agent URL must not include credentials, query params, or a path.");
	}

	return parsed.toString().replace(/\/$/, "");
}

function matchesStoredToken(storedToken: string | null | undefined, candidate: string) {
	if (!storedToken) {
		return false;
	}

	return storedToken === candidate || storedToken === hashToken(candidate);
}

async function issueRegistrationToken(agentId: string) {
	const token = randomToken(48);

	await db
		.update(agents)
		.set({
			registrationToken: token,
			updatedAt: now(),
		})
		.where(eq(agents.id, agentId));

	return token;
}

async function requireOwnedProject(projectId: string, userId: string) {
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.createdByUserId, userId)),
		columns: {
			id: true,
		},
	});

	if (!project) {
		throw new Error("Project not found");
	}

	return project;
}

async function requireOwnedEnvironment(environmentId: string, userId: string) {
	const environment = await db.query.environments.findFirst({
		where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
		columns: {
			id: true,
		},
	});

	if (!environment) {
		throw new Error("Environment not found");
	}

	return environment;
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
		registrationToken: hashToken(randomToken(40)),
		accessToken: hashToken(randomToken(48)),
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

export async function getDashboardData(userId: string, options?: { includeRuntime?: boolean }) {
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

	const visibleStacks = await db.query.stacks.findMany({
		where: eq(stacks.createdByUserId, userId),
		columns: {
			id: true,
		},
	});
	const visibleStackIds = visibleStacks.map((stack) => stack.id);
	const recentDeployments = visibleStackIds.length
		? await db.query.deployments.findMany({
				where: inArray(deployments.stackId, visibleStackIds),
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
			})
		: [];

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

	return {
		projectCount: Number(projectCount?.count ?? 0),
		environmentCount: Number(environmentCount?.count ?? 0),
		stackCount: Number(stackCount?.count ?? 0),
		deploymentCount: Number(deploymentCount?.count ?? 0),
		recentDeployments,
		recentProjects,
		runtime: options?.includeRuntime ? await getLocalDockerSnapshot() : null,
		dataDir: options?.includeRuntime ? getPlatformDataDir() : null,
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

export async function listStacks(userId: string, options?: { includeUntracked?: boolean }) {
	await ensureDefaultLocalEnvironment(userId);

	const [trackedStacks, runtimeContainers, composeProjects] = await Promise.all([
		db.query.stacks.findMany({
			where: eq(stacks.createdByUserId, userId),
			orderBy: [desc(stacks.updatedAt)],
			with: {
				project: true,
				environment: true,
				deployments: {
					orderBy: [desc(deployments.createdAt)],
					limit: 1,
				},
			},
		}),
		listContainers(),
		options?.includeUntracked ? listComposeProjects() : Promise.resolve([]),
	]);

	const runtimeByProject = new Map<string, Array<Record<string, string>>>();

	for (const container of runtimeContainers) {
		const labels = container.Labels || "";
		const composeProject = labels
			.split(",")
			.find((label) => label.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=");

		if (!composeProject) {
			continue;
		}

		const current = runtimeByProject.get(composeProject) || [];
		current.push(container);
		runtimeByProject.set(composeProject, current);
	}

	const tracked = trackedStacks.map((stack) => {
		const containers = runtimeByProject.get(stack.slug) || [];
		return {
			type: "tracked" as const,
			slug: stack.slug,
			name: stack.name,
			status: stack.status,
			projectName: stack.project.name,
			projectId: stack.project.id,
			stackId: stack.id,
			environmentName: stack.environment.name,
			sourceType: stack.sourceType,
			composeFileName: stack.composeFileName,
			containerCount: containers.length,
			runningCount: containers.filter((container) => container.State === "running").length,
			containers,
			lastDeployment: stack.deployments[0] || null,
		};
	});

	const trackedSlugs = new Set(tracked.map((stack) => stack.slug));
	const untracked = composeProjects
		.filter((project) => !trackedSlugs.has(project.name))
		.map((project) => ({
			type: "untracked" as const,
			slug: project.name,
			name: project.name,
			status: project.status,
			projectName: null,
			projectId: null,
			stackId: null,
			environmentName: "External compose project",
			sourceType: "external" as const,
			composeFileName: project.configFiles[0]?.split("/").at(-1) || "compose.yaml",
			configFiles: project.configFiles,
			containerCount: project.containerCount,
			runningCount: project.runningCount,
			containers: project.containers,
			lastDeployment: null,
		}));

	return [...tracked, ...untracked].sort((left, right) => left.name.localeCompare(right.name));
}

export async function listGitHubInstallations(userId: string) {
	if (
		!process.env.GITHUB_APP_ID ||
		!process.env.GITHUB_APP_PRIVATE_KEY ||
		!process.env.GITHUB_APP_SLUG
	) {
		return [];
	}

	let installations = await db.query.githubInstallations.findMany({
		where: eq(githubInstallations.createdByUserId, userId),
		orderBy: [desc(githubInstallations.updatedAt)],
	});

	if (!installations.length) {
		const remoteInstallations = await listGitHubAppInstallations();

		for (const installation of remoteInstallations) {
			await syncGitHubInstallation({
				userId,
				githubInstallationId: String(installation.id),
			});
		}

		installations = await db.query.githubInstallations.findMany({
			where: eq(githubInstallations.createdByUserId, userId),
			orderBy: [desc(githubInstallations.updatedAt)],
		});
	}

	const hydrated = await Promise.all(
		installations.map(async (installation) => {
			try {
				const repositories = await listInstallationRepositories(installation.githubInstallationId);
				return {
					...installation,
					repositories,
				};
			} catch (error) {
				return {
					...installation,
					repositories: [],
					repositoryError:
						error instanceof Error ? error.message : "Unable to load installation repositories.",
				};
			}
		}),
	);

	return hydrated;
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

	const ownedStacks = await db.query.stacks.findMany({
		where: eq(stacks.createdByUserId, userId),
		columns: {
			id: true,
		},
	});
	const stackIds = ownedStacks.map((stack) => stack.id);

	if (!stackIds.length) {
		return [];
	}

	return db.query.deployments.findMany({
		where: inArray(deployments.stackId, stackIds),
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
	agentUrl,
}: {
	userId: string;
	name: string;
	description?: string;
	agentUrl?: string;
}) {
	const createdAt = now();
	const environmentId = crypto.randomUUID();
	const slug = await ensureUniqueEnvironmentSlug(name);
	const registrationToken = randomToken(48);
	const normalizedAgentUrl = normalizeAgentUrl(agentUrl);

	await db.insert(environments).values({
		id: environmentId,
		name,
		slug,
		description: description?.trim() || null,
		kind: "agent",
		status: "provisioning",
		managerUrl: normalizedAgentUrl,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	await db.insert(agents).values({
		id: crypto.randomUUID(),
		environmentId,
		status: "provisioning",
		registrationToken,
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
	await Promise.all([
		requireOwnedProject(projectId, userId),
		requireOwnedEnvironment(environmentId, userId),
	]);

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

export async function adoptComposeProject({
	userId,
	projectName,
	configFiles,
}: {
	userId: string;
	projectName: string;
	configFiles: string[];
}) {
	if (!projectName || !configFiles.length) {
		throw new Error("Compose project name and config files are required.");
	}

	const existingStack = await db.query.stacks.findFirst({
		where: and(eq(stacks.createdByUserId, userId), eq(stacks.slug, projectName)),
	});

	if (existingStack) {
		return existingStack.id;
	}

	const environment = await ensureDefaultLocalEnvironment(userId);
	if (!environment) {
		throw new Error("Default local environment could not be prepared.");
	}
	const exported = await exportComposeProjectConfig(projectName, configFiles);
	const createdAt = now();
	const projectId = crypto.randomUUID();
	const projectSlug = await ensureUniqueProjectSlug(projectName);
	const humanName = projectName
		.split("-")
		.map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
		.join(" ");

	await db.insert(projects).values({
		id: projectId,
		name: humanName,
		slug: projectSlug,
		description: `Adopted from external compose project ${projectName}.`,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	const stackId = crypto.randomUUID();
	await db.insert(stacks).values({
		id: stackId,
		projectId,
		environmentId: environment.id,
		name: humanName,
		slug: projectName,
		description: `Imported from ${configFiles.join(", ")}`,
		sourceType: "manual",
		status: "stopped",
		composeYaml: exported.composeYaml,
		composeFileName: configFiles[0].split("/").at(-1) || "compose.yaml",
		envFileContent: exported.envFileContent,
		envFileName: ".env",
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	revalidatePath("/dashboard/projects");
	revalidatePath("/dashboard/stacks");
	return stackId;
}

export async function syncGitHubInstallation({
	userId,
	githubInstallationId,
}: {
	userId: string;
	githubInstallationId: string;
}) {
	const installation = await getGitHubInstallation(githubInstallationId);
	const existing = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.githubInstallationId, githubInstallationId),
	});
	const updatedAt = now();

	if (existing) {
		await db
			.update(githubInstallations)
			.set({
				accountLogin: installation.account.login,
				accountType: installation.account.type,
				appSlug: installation.app_slug,
				updatedAt,
			})
			.where(eq(githubInstallations.id, existing.id));

		return existing.id;
	}

	const id = crypto.randomUUID();
	await db.insert(githubInstallations).values({
		id,
		githubInstallationId,
		accountLogin: installation.account.login,
		accountType: installation.account.type,
		appSlug: installation.app_slug,
		createdByUserId: userId,
		createdAt: updatedAt,
		updatedAt,
	});

	return id;
}

async function materializeGitHubStackSource(input: {
	githubInstallationId: string;
	owner: string;
	repository: string;
	branch: string;
	composePath: string;
	envPath?: string;
}) {
	const compose = await fetchRepositoryTextFile({
		installationId: input.githubInstallationId,
		owner: input.owner,
		repository: input.repository,
		path: input.composePath,
		ref: input.branch,
	});
	const envFile = input.envPath
		? await fetchRepositoryTextFile({
				installationId: input.githubInstallationId,
				owner: input.owner,
				repository: input.repository,
				path: input.envPath,
				ref: input.branch,
			})
		: null;
	const headSha = await getRepositoryBranchHeadSha({
		installationId: input.githubInstallationId,
		owner: input.owner,
		repository: input.repository,
		branch: input.branch,
	});

	return {
		composeYaml: compose.text,
		envFileContent: envFile?.text ?? null,
		sourceCommitSha: headSha,
	};
}

async function resolveGitHubDeploymentSource(
	stack: {
		sourceType: "manual" | "github";
		githubInstallation: { githubInstallationId: string } | null;
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

	const sourceCommitSha = await getRepositoryBranchHeadSha({
		installationId: stack.githubInstallation.githubInstallationId,
		owner: stack.githubOwner,
		repository: stack.githubRepository,
		branch: stack.githubBranch,
	});

	return {
		sourceCommitSha,
		sourceArchive: options?.includeArchive
			? await downloadRepositoryTarball({
					installationId: stack.githubInstallation.githubInstallationId,
					owner: stack.githubOwner,
					repository: stack.githubRepository,
					ref: sourceCommitSha,
				})
			: null,
	};
}

export async function createGitHubStack({
	userId,
	projectId,
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
}: {
	userId: string;
	projectId: string;
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
}) {
	await Promise.all([
		requireOwnedProject(projectId, userId),
		requireOwnedEnvironment(environmentId, userId),
	]);

	const installation = await db.query.githubInstallations.findFirst({
		where: and(
			eq(githubInstallations.id, installationId),
			eq(githubInstallations.createdByUserId, userId),
		),
	});

	if (!installation) {
		throw new Error("GitHub installation not found");
	}

	const source = composeYaml?.trim()
		? {
				composeYaml: composeYaml.trim(),
				envFileContent: envFileContent?.trim() || null,
				sourceCommitSha: await getRepositoryBranchHeadSha({
					installationId: installation.githubInstallationId,
					owner,
					repository,
					branch,
				}),
			}
		: await materializeGitHubStackSource({
				githubInstallationId: installation.githubInstallationId,
				owner,
				repository,
				branch,
				composePath,
				envPath,
			});
	const createdAt = now();
	const slug = await ensureUniqueStackSlug(name);

	await db.insert(stacks).values({
		id: crypto.randomUUID(),
		projectId,
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
			githubInstallation: true,
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
		initiatedByUserId: userId,
		operation,
		version,
		status: stack.environment.kind === "local" ? "running" : "queued",
		composeSnapshot,
		envSnapshot,
		sourceCommitSha: gitHubSource.sourceCommitSha,
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
	incrementDeploymentEvent(stack.environment.kind === "local" ? "deploying" : "queued");

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
	revalidatePath("/dashboard/projects");
	revalidatePath(`/dashboard/projects/${stack.projectId}`);
	revalidatePath(`/dashboard/projects/${stack.projectId}/stacks/${stack.id}`);
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${stack.environmentId}`);
}

async function deleteOwnedStackById(stackId: string, userId: string) {
	const stack = await db.query.stacks.findFirst({
		where: and(eq(stacks.id, stackId), eq(stacks.createdByUserId, userId)),
		with: {
			environment: true,
			project: true,
		},
	});

	if (!stack) {
		throw new Error("Stack not found");
	}

	if (stack.environment.kind === "local") {
		await deleteLocalStackResources(stack.slug);
	}

	await db.delete(stacks).where(eq(stacks.id, stack.id));

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/projects");
	revalidatePath(`/dashboard/projects/${stack.projectId}`);
	revalidatePath(`/dashboard/projects/${stack.projectId}/stacks/${stack.id}`);
	revalidatePath("/dashboard/stacks");
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/logs");
}

export async function deleteStack({ stackId, userId }: { stackId: string; userId: string }) {
	await deleteOwnedStackById(stackId, userId);
}

export async function deleteProject({ projectId, userId }: { projectId: string; userId: string }) {
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.createdByUserId, userId)),
		with: {
			stacks: {
				with: {
					environment: true,
				},
			},
		},
	});

	if (!project) {
		throw new Error("Project not found");
	}

	for (const stack of project.stacks) {
		await deleteOwnedStackById(stack.id, userId);
	}

	await db.delete(projects).where(eq(projects.id, project.id));

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/projects");
	revalidatePath(`/dashboard/projects/${project.id}`);
	revalidatePath("/dashboard/stacks");
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/logs");
}

export async function deleteEnvironment({
	environmentId,
	userId,
}: {
	environmentId: string;
	userId: string;
}) {
	const environment = await db.query.environments.findFirst({
		where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
		with: {
			stacks: {
				with: {
					environment: true,
				},
			},
		},
	});

	if (!environment) {
		throw new Error("Environment not found");
	}

	if (environment.isDefaultLocal) {
		throw new Error("The built-in local environment cannot be deleted.");
	}

	for (const stack of environment.stacks) {
		await deleteOwnedStackById(stack.id, userId);
	}

	await db.delete(environments).where(eq(environments.id, environment.id));

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${environment.id}`);
	revalidatePath("/dashboard/projects");
	revalidatePath("/dashboard/stacks");
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/logs");
}

export async function getAgentInstallContext(registrationToken: string) {
	const allAgents = await db.query.agents.findMany({
		with: {
			environment: true,
		},
	});

	return (
		allAgents.find((agent) => matchesStoredToken(agent.registrationToken, registrationToken)) ||
		null
	);
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
	const allAgents = await db.query.agents.findMany({
		with: {
			environment: true,
		},
	});
	const agent =
		allAgents.find((candidate) =>
			matchesStoredToken(candidate.registrationToken, registrationToken),
		) || null;

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
		managerUrl: publicEnv.appUrl,
	};
}

export async function heartbeatAgent(accessToken: string) {
	const allAgents = await db.query.agents.findMany();
	const agent = allAgents.find((candidate) =>
		matchesStoredToken(candidate.accessToken, accessToken),
	);

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

	emitToRoom(`stack:${deployment.stackId}`, "deployment:complete", {
		stackId: deployment.stackId,
		deploymentId,
		status,
		at: Date.now(),
	});
	incrementDeploymentEvent(status);
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

	const registrationToken =
		environment.agent[0].registrationToken ||
		(await issueRegistrationToken(environment.agent[0].id));
	const managerUrl = publicEnv.appUrl.replace(/\/$/, "");
	const dataVolumeName = `dockroot_agent_data_${environment.slug.replace(/-/g, "_")}`;
	const dockerRun = [
		"docker run -d \\",
		`  --name dockroot-agent-${environment.slug} \\`,
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
		dockerRun,
		dockerCompose,
		legacyInstallScript: `${publicEnv.appUrl.replace(/\/$/, "")}/api/agent/install/${registrationToken}`,
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

export async function triggerGitHubPushDeploy(input: {
	githubInstallationId: string;
	owner: string;
	repository: string;
	branch: string;
}) {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.githubInstallationId, input.githubInstallationId),
	});

	if (!installation) {
		return;
	}

	const matchingStacks = await db.query.stacks.findMany({
		where: and(
			eq(stacks.githubInstallationId, installation.id),
			eq(stacks.githubOwner, input.owner),
			eq(stacks.githubRepository, input.repository),
			eq(stacks.githubBranch, input.branch),
		),
		columns: {
			id: true,
			createdByUserId: true,
		},
	});

	for (const stack of matchingStacks) {
		const fullStack = await db.query.stacks.findFirst({
			where: eq(stacks.id, stack.id),
			with: {
				githubInstallation: true,
			},
		});

		if (
			fullStack?.githubInstallation &&
			fullStack.githubOwner &&
			fullStack.githubRepository &&
			fullStack.githubBranch &&
			fullStack.githubPath
		) {
			const source = await materializeGitHubStackSource({
				githubInstallationId: fullStack.githubInstallation.githubInstallationId,
				owner: fullStack.githubOwner,
				repository: fullStack.githubRepository,
				branch: fullStack.githubBranch,
				composePath: fullStack.githubPath,
				envPath: fullStack.githubEnvPath || undefined,
			});

			await db
				.update(stacks)
				.set({
					composeYaml: source.composeYaml,
					envFileContent: source.envFileContent,
					updatedAt: now(),
				})
				.where(eq(stacks.id, fullStack.id));
		}

		await queueOrRunDeployment({
			stackId: stack.id,
			userId: stack.createdByUserId,
			operation: "deploy",
		});
	}
}
