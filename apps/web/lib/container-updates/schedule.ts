import "server-only";

import { randomUUID } from "node:crypto";
import { containerUpdateSchedules, db } from "@dockroot/db";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { assertOwnedEnvironment } from "@/lib/container-updates/policy";
import { addMinutes, clampIntervalMinutes, now } from "@/lib/container-updates/shared";
import type { ContainerUpdateCheckMode } from "@/lib/container-updates/types";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";

export async function getOrCreateContainerUpdateSchedule(userId: string, environmentId?: string) {
	const environment = await resolveRuntimeEnvironment(userId, environmentId);
	const existing = await db.query.containerUpdateSchedules.findFirst({
		where: and(
			eq(containerUpdateSchedules.environmentId, environment.id),
			eq(containerUpdateSchedules.createdByUserId, userId),
		),
	});

	if (existing) {
		return existing;
	}

	const createdAt = now();
	const scheduleId = randomUUID();
	const row = {
		id: scheduleId,
		environmentId: environment.id,
		autoCheckEnabled: false,
		autoUpdateEnabled: false,
		checkMode: "same_tag" as const,
		checkIntervalMinutes: 60,
		updateIntervalMinutes: 240,
		pullBeforeCheck: true,
		updateOnlyRunning: true,
		nextCheckAt: null,
		nextUpdateAt: null,
		lastCheckAt: null,
		lastUpdateAt: null,
		runningLeaseUntil: null,
		runningWorkerId: null,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	};

	await db
		.insert(containerUpdateSchedules)
		.values(row)
		.onConflictDoNothing({
			target: [containerUpdateSchedules.environmentId, containerUpdateSchedules.createdByUserId],
		});

	const hydrated = await db.query.containerUpdateSchedules.findFirst({
		where: and(
			eq(containerUpdateSchedules.environmentId, environment.id),
			eq(containerUpdateSchedules.createdByUserId, userId),
		),
	});

	if (!hydrated) {
		throw new Error("Unable to create update schedule.");
	}

	return hydrated;
}

export async function updateContainerUpdateSchedule(input: {
	userId: string;
	environmentId: string;
	checkMode: ContainerUpdateCheckMode;
	autoCheckEnabled: boolean;
	autoUpdateEnabled: boolean;
	checkIntervalMinutes: number;
	updateIntervalMinutes: number;
	pullBeforeCheck: boolean;
	updateOnlyRunning: boolean;
}) {
	await assertOwnedEnvironment({
		environmentId: input.environmentId,
		userId: input.userId,
	});

	const existing = await getOrCreateContainerUpdateSchedule(input.userId, input.environmentId);
	const updatedAt = now();
	const checkIntervalMinutes = clampIntervalMinutes(input.checkIntervalMinutes, 60);
	const updateIntervalMinutes = clampIntervalMinutes(input.updateIntervalMinutes, 240);

	await db
		.update(containerUpdateSchedules)
		.set({
			autoCheckEnabled: input.autoCheckEnabled,
			autoUpdateEnabled: input.autoUpdateEnabled,
			checkMode: input.checkMode,
			checkIntervalMinutes,
			updateIntervalMinutes,
			pullBeforeCheck: input.pullBeforeCheck,
			updateOnlyRunning: input.updateOnlyRunning,
			nextCheckAt: input.autoCheckEnabled
				? existing.nextCheckAt && existing.nextCheckAt > updatedAt
					? existing.nextCheckAt
					: addMinutes(updatedAt, checkIntervalMinutes)
				: null,
			nextUpdateAt: input.autoUpdateEnabled
				? existing.nextUpdateAt && existing.nextUpdateAt > updatedAt
					? existing.nextUpdateAt
					: addMinutes(updatedAt, updateIntervalMinutes)
				: null,
			updatedAt,
		})
		.where(eq(containerUpdateSchedules.id, existing.id));
}

export async function claimDueSchedules(workerId: string, maxSchedules: number) {
	const current = now();
	const due = await db.query.containerUpdateSchedules.findMany({
		where: and(
			or(
				and(
					eq(containerUpdateSchedules.autoCheckEnabled, true),
					or(
						isNull(containerUpdateSchedules.nextCheckAt),
						lt(containerUpdateSchedules.nextCheckAt, current),
					),
				),
				and(
					eq(containerUpdateSchedules.autoUpdateEnabled, true),
					or(
						isNull(containerUpdateSchedules.nextUpdateAt),
						lt(containerUpdateSchedules.nextUpdateAt, current),
					),
				),
			),
			or(
				isNull(containerUpdateSchedules.runningLeaseUntil),
				lt(containerUpdateSchedules.runningLeaseUntil, current),
			),
		),
		orderBy: [asc(containerUpdateSchedules.updatedAt)],
		limit: Math.max(1, Math.min(20, maxSchedules * 3)),
	});

	const claimed = [] as typeof due;
	for (const schedule of due) {
		const leasedUntil = addMinutes(current, 5);
		const rows = await db
			.update(containerUpdateSchedules)
			.set({
				runningLeaseUntil: leasedUntil,
				runningWorkerId: workerId,
				updatedAt: current,
			})
			.where(
				and(
					eq(containerUpdateSchedules.id, schedule.id),
					or(
						isNull(containerUpdateSchedules.runningLeaseUntil),
						lt(containerUpdateSchedules.runningLeaseUntil, current),
					),
				),
			)
			.returning();
		if (rows.length) {
			claimed.push(rows[0]);
		}
		if (claimed.length >= maxSchedules) {
			break;
		}
	}

	return claimed;
}

export async function releaseScheduleLease(scheduleId: string, updatedAt = now()) {
	await db
		.update(containerUpdateSchedules)
		.set({
			runningLeaseUntil: null,
			runningWorkerId: null,
			updatedAt,
		})
		.where(eq(containerUpdateSchedules.id, scheduleId));
}
