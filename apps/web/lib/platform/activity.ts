import { db, deployments, environments, runtimeActionEvents } from "@dockroot/db";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { ensureDefaultLocalEnvironment } from "./environments";

export async function listRuntimeActions(
	userId: string,
	limit = 80,
	options?: { environmentId?: string },
) {
	await ensureDefaultLocalEnvironment(userId);

	const ownedEnvironments = await db.query.environments.findMany({
		where: eq(environments.createdByUserId, userId),
		columns: { id: true },
	});
	const environmentIds = ownedEnvironments.map((environment) => environment.id);
	const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));

	try {
		if (options?.environmentId) {
			return db.query.runtimeActionEvents.findMany({
				where: and(
					eq(runtimeActionEvents.environmentId, options.environmentId),
					or(
						eq(runtimeActionEvents.actorUserId, userId),
						eq(runtimeActionEvents.environmentId, options.environmentId),
					),
				),
				orderBy: [desc(runtimeActionEvents.occurredAt)],
				limit: boundedLimit,
				with: {
					environment: true,
					actor: true,
				},
			});
		}

		if (!environmentIds.length) {
			return db.query.runtimeActionEvents.findMany({
				where: eq(runtimeActionEvents.actorUserId, userId),
				orderBy: [desc(runtimeActionEvents.occurredAt)],
				limit: boundedLimit,
				with: {
					environment: true,
					actor: true,
				},
			});
		}

		return db.query.runtimeActionEvents.findMany({
			where: or(
				eq(runtimeActionEvents.actorUserId, userId),
				inArray(runtimeActionEvents.environmentId, environmentIds),
			),
			orderBy: [desc(runtimeActionEvents.occurredAt)],
			limit: boundedLimit,
			with: {
				environment: true,
				actor: true,
			},
		});
	} catch (error) {
		console.error("Failed to list runtime actions", error);
		return [];
	}
}

export async function recordAuditEvent({
	environmentId,
	userId,
	actionType,
	status = "success",
	containerId,
	details,
}: {
	environmentId?: string;
	userId: string;
	actionType: string;
	status?: "info" | "success" | "warning" | "error";
	containerId?: string;
	details?: Record<string, unknown>;
}) {
	try {
		await db.insert(runtimeActionEvents).values({
			id: crypto.randomUUID(),
			environmentId: environmentId || null,
			actorUserId: userId,
			actorRole: null,
			source: "server-action",
			actionType,
			status,
			containerId: containerId || null,
			sessionId: null,
			details: details ? JSON.stringify(details) : null,
			occurredAt: new Date(),
			createdAt: new Date(),
		});
	} catch {
		// Non-critical: audit persistence failure should not break the action
	}
}

export async function deleteActivityEvents(userId: string, eventIds: string[]) {
	if (!eventIds.length) return { deleted: 0 };

	const ownedEnvironments = await db.query.environments.findMany({
		where: eq(environments.createdByUserId, userId),
		columns: { id: true },
	});
	const environmentIds = ownedEnvironments.map((e) => e.id);

	const ownershipFilter = environmentIds.length
		? or(
				eq(runtimeActionEvents.actorUserId, userId),
				inArray(runtimeActionEvents.environmentId, environmentIds),
			)
		: eq(runtimeActionEvents.actorUserId, userId);

	await db
		.delete(runtimeActionEvents)
		.where(and(inArray(runtimeActionEvents.id, eventIds), ownershipFilter));

	const deploymentOwnership = environmentIds.length
		? or(
				eq(deployments.initiatedByUserId, userId),
				inArray(deployments.environmentId, environmentIds),
			)
		: eq(deployments.initiatedByUserId, userId);

	await db.delete(deployments).where(and(inArray(deployments.id, eventIds), deploymentOwnership));

	return { deleted: eventIds.length };
}

export async function clearAllActivityEvents(userId: string) {
	const ownedEnvironments = await db.query.environments.findMany({
		where: eq(environments.createdByUserId, userId),
		columns: { id: true },
	});
	const environmentIds = ownedEnvironments.map((e) => e.id);

	const runtimeFilter = environmentIds.length
		? or(
				eq(runtimeActionEvents.actorUserId, userId),
				inArray(runtimeActionEvents.environmentId, environmentIds),
			)
		: eq(runtimeActionEvents.actorUserId, userId);
	await db.delete(runtimeActionEvents).where(runtimeFilter);

	const deploymentFilter = environmentIds.length
		? or(
				eq(deployments.initiatedByUserId, userId),
				inArray(deployments.environmentId, environmentIds),
			)
		: eq(deployments.initiatedByUserId, userId);
	await db.delete(deployments).where(deploymentFilter);

	return { deleted: true };
}
