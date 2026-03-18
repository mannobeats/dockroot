import "server-only";

import { randomUUID } from "node:crypto";
import { containerUpdatePolicies, db, environments } from "@dockroot/db";
import { and, desc, eq } from "drizzle-orm";
import { containerNameOf, now } from "@/lib/container-updates/shared";
import type { ContainerUpdatePolicyMap } from "@/lib/container-updates/types";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";

export async function getContainerUpdatePolicyMap(userId: string, environmentId?: string) {
	const environment = await resolveRuntimeEnvironment(userId, environmentId);
	const rows = await db.query.containerUpdatePolicies.findMany({
		where: and(
			eq(containerUpdatePolicies.environmentId, environment.id),
			eq(containerUpdatePolicies.createdByUserId, userId),
		),
		orderBy: [desc(containerUpdatePolicies.updatedAt)],
	});

	const map: ContainerUpdatePolicyMap = new Map();
	for (const row of rows) {
		map.set(row.containerName, {
			id: row.id,
			checkEnabled: row.checkEnabled,
			updateEnabled: row.updateEnabled,
		});
	}
	return { environment, map };
}

export async function setContainerUpdatePolicy(input: {
	userId: string;
	environmentId?: string;
	containerName: string;
	checkEnabled?: boolean;
	updateEnabled?: boolean;
}) {
	const environment = await resolveRuntimeEnvironment(input.userId, input.environmentId);
	const containerName = input.containerName.trim();
	if (!containerName) {
		throw new Error("Container name is required.");
	}

	const existing = await db.query.containerUpdatePolicies.findFirst({
		where: and(
			eq(containerUpdatePolicies.environmentId, environment.id),
			eq(containerUpdatePolicies.createdByUserId, input.userId),
			eq(containerUpdatePolicies.containerName, containerName),
		),
	});

	const createdAt = now();
	const target = {
		checkEnabled: input.checkEnabled ?? existing?.checkEnabled ?? true,
		updateEnabled: input.updateEnabled ?? existing?.updateEnabled ?? false,
	};

	if (existing) {
		await db
			.update(containerUpdatePolicies)
			.set({
				checkEnabled: target.checkEnabled,
				updateEnabled: target.updateEnabled,
				updatedAt: createdAt,
			})
			.where(eq(containerUpdatePolicies.id, existing.id));
		return;
	}

	await db.insert(containerUpdatePolicies).values({
		id: randomUUID(),
		environmentId: environment.id,
		containerName,
		checkEnabled: target.checkEnabled,
		updateEnabled: target.updateEnabled,
		createdByUserId: input.userId,
		createdAt,
		updatedAt: createdAt,
	});
}

export async function ensurePoliciesForContainers(input: {
	userId: string;
	environmentId: string;
	containers: Array<Record<string, string>>;
}) {
	const rows = input.containers
		.map((container) => containerNameOf(container))
		.filter(Boolean)
		.map((containerName) => ({
			id: randomUUID(),
			environmentId: input.environmentId,
			containerName,
			checkEnabled: true,
			updateEnabled: false,
			createdByUserId: input.userId,
			createdAt: now(),
			updatedAt: now(),
		}));

	if (!rows.length) {
		return;
	}

	await db
		.insert(containerUpdatePolicies)
		.values(rows)
		.onConflictDoNothing({
			target: [
				containerUpdatePolicies.environmentId,
				containerUpdatePolicies.createdByUserId,
				containerUpdatePolicies.containerName,
			],
		});
}

export async function assertOwnedEnvironment(input: { environmentId: string; userId: string }) {
	const environment = await db.query.environments.findFirst({
		where: and(
			eq(environments.id, input.environmentId),
			eq(environments.createdByUserId, input.userId),
		),
		columns: { id: true },
	});
	if (!environment) {
		throw new Error("Environment not found.");
	}
	return environment;
}
