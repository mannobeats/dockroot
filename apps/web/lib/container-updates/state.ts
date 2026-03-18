import "server-only";

import { randomUUID } from "node:crypto";
import { containerUpdateStates, db } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { now } from "@/lib/container-updates/shared";
import type { ContainerUpdateStateMap } from "@/lib/container-updates/types";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";

export async function getContainerUpdateStateMap(userId: string, environmentId?: string) {
	const environment = await resolveRuntimeEnvironment(userId, environmentId);
	const rows = await db.query.containerUpdateStates.findMany({
		where: and(
			eq(containerUpdateStates.environmentId, environment.id),
			eq(containerUpdateStates.createdByUserId, userId),
		),
	});
	const map: ContainerUpdateStateMap = new Map();
	for (const row of rows) {
		map.set(row.containerName, {
			id: row.id,
			updateAvailable: row.updateAvailable,
			majorUpdateAvailable: row.majorUpdateAvailable,
			majorTargetImageRef: row.majorTargetImageRef || null,
			majorTargetTag: row.majorTargetTag || null,
			lastResult: row.lastResult || null,
			lastError: row.lastError || null,
			checkedAt: row.checkedAt || null,
			updatedAt: row.updatedAt || null,
		});
	}
	return { environment, map };
}

export async function upsertContainerUpdateState(input: {
	userId: string;
	environmentId: string;
	containerName: string;
	containerId?: string | null;
	imageRef?: string | null;
	runningImageId?: string | null;
	latestImageId?: string | null;
	majorTargetImageRef?: string | null;
	majorTargetTag?: string | null;
	updateAvailable: boolean;
	majorUpdateAvailable?: boolean;
	lastResult: (typeof containerUpdateStates.$inferInsert)["lastResult"];
	lastError?: string | null;
	checkedAt?: Date | null;
	updatedAt?: Date | null;
}) {
	const existing = await db.query.containerUpdateStates.findFirst({
		where: and(
			eq(containerUpdateStates.environmentId, input.environmentId),
			eq(containerUpdateStates.createdByUserId, input.userId),
			eq(containerUpdateStates.containerName, input.containerName),
		),
	});
	const createdAt = now();

	if (existing) {
		await db
			.update(containerUpdateStates)
			.set({
				containerId: input.containerId || null,
				imageRef: input.imageRef || null,
				runningImageId: input.runningImageId || null,
				latestImageId: input.latestImageId || null,
				majorTargetImageRef:
					input.majorTargetImageRef === undefined
						? existing.majorTargetImageRef
						: input.majorTargetImageRef || null,
				majorTargetTag:
					input.majorTargetTag === undefined
						? existing.majorTargetTag
						: input.majorTargetTag || null,
				updateAvailable: input.updateAvailable,
				majorUpdateAvailable: input.majorUpdateAvailable ?? existing.majorUpdateAvailable,
				lastResult: input.lastResult,
				lastError: input.lastError || null,
				checkedAt: input.checkedAt || existing.checkedAt,
				updatedAt: input.updatedAt || existing.updatedAt,
				modifiedAt: createdAt,
			})
			.where(eq(containerUpdateStates.id, existing.id));
		return;
	}

	await db.insert(containerUpdateStates).values({
		id: randomUUID(),
		environmentId: input.environmentId,
		containerName: input.containerName,
		containerId: input.containerId || null,
		imageRef: input.imageRef || null,
		runningImageId: input.runningImageId || null,
		latestImageId: input.latestImageId || null,
		majorTargetImageRef: input.majorTargetImageRef || null,
		majorTargetTag: input.majorTargetTag || null,
		updateAvailable: input.updateAvailable,
		majorUpdateAvailable: input.majorUpdateAvailable ?? false,
		lastResult: input.lastResult,
		lastError: input.lastError || null,
		checkedAt: input.checkedAt || null,
		updatedAt: input.updatedAt || null,
		createdByUserId: input.userId,
		createdAt,
		modifiedAt: createdAt,
	});
}
