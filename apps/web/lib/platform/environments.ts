import { agents, db, deployments, environments, stacks } from "@dockroot/db";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { publicEnv } from "@/lib/public-env";
import { ensureUniqueEnvironmentSlug, requireOwnedEnvironment } from "./queries";
import {
	applyDerivedEnvironmentState,
	hashToken,
	normalizeAgentUrl,
	now,
	randomToken,
	resolveStoredAgentRuntimeUrl,
	slugify,
} from "./shared";
import { deleteOwnedStackById } from "./stack-cleanup";

export async function ensureDefaultLocalEnvironment(userId: string) {
	const slug = `local-docker-${userId.slice(0, 8)}`;
	const loadDefaultEnvironment = () =>
		db.query.environments.findFirst({
			where: and(
				eq(environments.createdByUserId, userId),
				eq(environments.kind, "local"),
				eq(environments.isDefaultLocal, true),
			),
			with: {
				agent: true,
			},
		});

	const existing = await loadDefaultEnvironment();
	if (existing?.agent) {
		return existing;
	}

	const createdAt = now();

	if (!existing) {
		await db
			.insert(environments)
			.values({
				id: crypto.randomUUID(),
				name: "Local Docker",
				slug,
				description: "Built-in manager host for instant compose deployments.",
				kind: "local",
				status: "healthy",
				isDefaultLocal: true,
				managerUrl: publicEnv.appUrl,
				createdByUserId: userId,
				createdAt,
				updatedAt: createdAt,
			})
			.onConflictDoNothing({
				target: environments.slug,
			});
	}

	const environment = await loadDefaultEnvironment();
	if (!environment) {
		throw new Error("Failed to provision the default local environment.");
	}

	if (!environment.agent) {
		await db
			.insert(agents)
			.values({
				id: crypto.randomUUID(),
				environmentId: environment.id,
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
			})
			.onConflictDoNothing({
				target: agents.environmentId,
			});
	}

	const hydrated = await loadDefaultEnvironment();
	if (!hydrated) {
		throw new Error("Failed to load the default local environment.");
	}

	return hydrated;
}

export async function listEnvironments(userId: string) {
	await ensureDefaultLocalEnvironment(userId);

	const environmentsList = await db.query.environments.findMany({
		where: eq(environments.createdByUserId, userId),
		orderBy: [desc(environments.updatedAt)],
		with: {
			agent: true,
			stacks: true,
		},
	});

	return environmentsList.map((environment) => applyDerivedEnvironmentState(environment));
}

export async function getEnvironmentById(environmentId: string, userId: string) {
	const environment = await db.query.environments.findFirst({
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

	return environment ? applyDerivedEnvironmentState(environment) : null;
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
		registrationToken: hashToken(registrationToken),
		createdAt,
		updatedAt: createdAt,
	});

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/environments");

	return environmentId;
}

export async function updateEnvironment({
	environmentId,
	userId,
	name,
	description,
	agentUrl,
}: {
	environmentId: string;
	userId: string;
	name: string;
	description?: string;
	agentUrl?: string;
}) {
	const environment = await requireOwnedEnvironment(environmentId, userId);
	const updatedAt = now();
	const normalizedAgentUrl = environment.isDefaultLocal ? null : normalizeAgentUrl(agentUrl);

	await db
		.update(environments)
		.set({
			name,
			slug: environment.isDefaultLocal ? environment.slug : slugify(name),
			description: description || null,
			managerUrl: environment.isDefaultLocal ? environment.managerUrl : normalizedAgentUrl,
			updatedAt,
		})
		.where(eq(environments.id, environment.id));

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${environment.id}`);
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
		await deleteOwnedStackById(stack.id, userId, { destroyRuntime: false });
	}

	await db.delete(environments).where(eq(environments.id, environment.id));

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${environment.id}`);
	revalidatePath("/dashboard/stacks");
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/logs");
}

export function deriveRegisteredManagerUrl(input: {
	currentUrl?: string | null;
	inferredUrl?: string | null;
	hostname?: string | null;
}) {
	return resolveStoredAgentRuntimeUrl(input);
}
