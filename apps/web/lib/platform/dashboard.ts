import { db, deployments, environments, stacks } from "@dockroot/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { listComposeProjects, listContainers } from "@/lib/platform/docker";
import { getPlatformDataDir } from "@/lib/platform/fs";
import { isProtectedManagerStack } from "@/lib/runtime-protection";
import { ensureDefaultLocalEnvironment } from "./environments";
import { fetchRemoteContainersWithTimeout, isAgentStale } from "./shared";

export async function getDashboardData(userId: string, options?: { includeRuntime?: boolean }) {
	await ensureDefaultLocalEnvironment(userId);

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

	const recentStacks = await db.query.stacks.findMany({
		where: eq(stacks.createdByUserId, userId),
		orderBy: [desc(stacks.updatedAt)],
		limit: 4,
		columns: {
			id: true,
			name: true,
			description: true,
		},
		with: {
			environment: {
				columns: {
					id: true,
					name: true,
					slug: true,
				},
			},
		},
	});

	return {
		environmentCount: Number(environmentCount?.count ?? 0),
		stackCount: Number(stackCount?.count ?? 0),
		deploymentCount: Number(deploymentCount?.count ?? 0),
		recentDeployments,
		recentStacks,
		runtime: null,
		dataDir: options?.includeRuntime ? getPlatformDataDir() : null,
	};
}

export async function listStacks(
	userId: string,
	options?: { includeUntracked?: boolean; environmentId?: string },
) {
	await ensureDefaultLocalEnvironment(userId);

	const selectedEnvironment = options?.environmentId
		? await db.query.environments.findFirst({
				where: and(
					eq(environments.id, options.environmentId),
					eq(environments.createdByUserId, userId),
				),
				with: {
					agent: true,
				},
			})
		: null;

	const trackedStacks = await db.query.stacks.findMany({
		where: options?.environmentId
			? and(eq(stacks.createdByUserId, userId), eq(stacks.environmentId, options.environmentId))
			: eq(stacks.createdByUserId, userId),
		orderBy: [desc(stacks.updatedAt)],
		with: {
			environment: true,
			deployments: {
				orderBy: [desc(deployments.createdAt)],
				limit: 1,
			},
		},
	});

	let runtimeContainers: Array<Record<string, string>> = [];
	let composeProjects: Array<{
		name: string;
		status: string;
		configFiles: string[];
		containers: Array<Record<string, string>>;
		containerCount: number;
		runningCount: number;
	}> = [];

	if (!selectedEnvironment || selectedEnvironment.kind === "local") {
		runtimeContainers = await listContainers();
		composeProjects = options?.includeUntracked ? await listComposeProjects() : [];
	} else {
		const agent = selectedEnvironment.agent?.[0];
		if (selectedEnvironment.managerUrl && agent?.accessToken && !isAgentStale(agent.lastSeenAt)) {
			runtimeContainers = await fetchRemoteContainersWithTimeout(
				selectedEnvironment.managerUrl,
				agent.accessToken,
			);
		}
	}

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
			stackId: stack.id,
			environmentName: stack.environment.name,
			sourceType: stack.sourceType,
			composeFileName: stack.composeFileName,
			containerCount: containers.length,
			runningCount: containers.filter((container) => container.State === "running").length,
			containers,
			lastDeployment: stack.deployments[0] || null,
			isProtected: isProtectedManagerStack(stack.slug),
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
			stackId: null,
			environmentName: "External compose project",
			sourceType: "external" as const,
			composeFileName: project.configFiles[0]?.split("/").at(-1) || "compose.yaml",
			configFiles: project.configFiles,
			containerCount: project.containerCount,
			runningCount: project.runningCount,
			containers: project.containers,
			lastDeployment: null,
			isProtected: isProtectedManagerStack(project.name),
		}));

	const inferredRemoteProjects =
		options?.includeUntracked && selectedEnvironment?.kind === "agent"
			? Array.from(runtimeByProject.entries())
					.filter(([projectName]) => !trackedSlugs.has(projectName))
					.map(([projectName, containers]) => ({
						type: "untracked" as const,
						slug: projectName,
						name: projectName,
						status: containers.some((container) => container.State === "running")
							? "running"
							: "stopped",
						stackId: null,
						environmentName: selectedEnvironment.name,
						sourceType: "external" as const,
						composeFileName: "compose.yaml",
						configFiles: [],
						containerCount: containers.length,
						runningCount: containers.filter((container) => container.State === "running").length,
						containers,
						lastDeployment: null,
						isProtected: isProtectedManagerStack(projectName),
					}))
			: [];

	return [...tracked, ...untracked, ...inferredRemoteProjects].sort((left, right) =>
		left.name.localeCompare(right.name),
	);
}
