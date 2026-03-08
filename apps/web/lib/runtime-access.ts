import "server-only";

import { db, stacks } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import type { AppRole } from "@/lib/authorization";
import { isPrivilegedRole } from "@/lib/authorization";
import { listContainersForEnvironment } from "@/lib/environment-runtime";

function getComposeProjectSlug(labels?: string | null) {
	return labels
		?.split(",")
		.find((label) => label.startsWith("com.docker.compose.project="))
		?.split("=")
		.slice(1)
		.join("=")
		.trim();
}

export async function listAccessibleContainersForUser(
	userId: string,
	role: AppRole,
	environmentId?: string,
) {
	const { containers } = await listContainersForEnvironment(userId, environmentId);

	if (isPrivilegedRole(role)) {
		return containers;
	}

	const ownedStacks = await db.query.stacks.findMany({
		where: environmentId
			? and(eq(stacks.createdByUserId, userId), eq(stacks.environmentId, environmentId))
			: eq(stacks.createdByUserId, userId),
		columns: {
			slug: true,
		},
	});
	const ownedSlugs = new Set(ownedStacks.map((stack) => stack.slug));

	return containers.filter((container) => {
		const composeProject = getComposeProjectSlug(container.Labels);
		return composeProject ? ownedSlugs.has(composeProject) : false;
	});
}

export async function requireAccessibleContainerForUser(input: {
	containerId: string;
	userId: string;
	role: AppRole;
	environmentId?: string;
}) {
	const containers = await listAccessibleContainersForUser(
		input.userId,
		input.role,
		input.environmentId,
	);
	const container = containers.find((candidate) => candidate.ID === input.containerId);

	if (!container) {
		throw new Error("Container not found");
	}

	return container;
}
