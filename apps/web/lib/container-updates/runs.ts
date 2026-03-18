import "server-only";

import { randomUUID } from "node:crypto";
import { containerUpdateRuns, db } from "@dockroot/db";
import { and, desc, eq } from "drizzle-orm";
import { now } from "@/lib/container-updates/shared";
import type { ContainerUpdateRunMetrics } from "@/lib/container-updates/types";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";

export async function listContainerUpdateRuns(input: {
	userId: string;
	environmentId?: string;
	limit?: number;
}) {
	const environment = await resolveRuntimeEnvironment(input.userId, input.environmentId);
	return db.query.containerUpdateRuns.findMany({
		where: and(
			eq(containerUpdateRuns.environmentId, environment.id),
			eq(containerUpdateRuns.createdByUserId, input.userId),
		),
		orderBy: [desc(containerUpdateRuns.startedAt)],
		limit: Math.max(1, Math.min(50, input.limit || 20)),
	});
}

export async function createUpdateRun(input: {
	userId: string;
	environmentId: string;
	runType: "check" | "update";
	scheduleId?: string | null;
}) {
	const createdAt = now();
	const runId = randomUUID();
	await db.insert(containerUpdateRuns).values({
		id: runId,
		scheduleId: input.scheduleId || null,
		environmentId: input.environmentId,
		runType: input.runType,
		status: "running",
		totalContainers: 0,
		checkedContainers: 0,
		availableContainers: 0,
		queuedStacks: 0,
		updatedContainers: 0,
		skippedContainers: 0,
		failedContainers: 0,
		summary: null,
		error: null,
		startedAt: createdAt,
		finishedAt: null,
		createdByUserId: input.userId,
		createdAt,
		updatedAt: createdAt,
	});
	return runId;
}

export async function completeUpdateRun(input: {
	runId: string;
	status: "succeeded" | "failed";
	summary: string;
	error?: string;
	metrics: ContainerUpdateRunMetrics;
}) {
	const updatedAt = now();
	await db
		.update(containerUpdateRuns)
		.set({
			status: input.status,
			summary: input.summary,
			error: input.error || null,
			totalContainers: input.metrics.totalContainers,
			checkedContainers: input.metrics.checkedContainers,
			availableContainers: input.metrics.availableContainers,
			queuedStacks: input.metrics.queuedStacks,
			updatedContainers: input.metrics.updatedContainers,
			skippedContainers: input.metrics.skippedContainers,
			failedContainers: input.metrics.failedContainers,
			finishedAt: updatedAt,
			updatedAt,
		})
		.where(eq(containerUpdateRuns.id, input.runId));
}
