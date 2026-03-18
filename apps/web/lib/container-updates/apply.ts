import "server-only";

import { containerUpdatePolicies, containerUpdateStates, db, stacks } from "@dockroot/db";
import { and, eq, inArray } from "drizzle-orm";
import { completeUpdateRun, createUpdateRun } from "@/lib/container-updates/runs";
import {
	composeProjectOf,
	containerNameOf,
	containerStateOf,
	now,
} from "@/lib/container-updates/shared";
import { upsertContainerUpdateState } from "@/lib/container-updates/state";
import type {
	ContainerUpdateApplySummary,
	ContainerUpdatePolicyMap,
} from "@/lib/container-updates/types";
import { listContainersForEnvironment, resolveRuntimeEnvironment } from "@/lib/environment-runtime";
import { queueOrRunDeployment } from "@/lib/platform";
import { isProtectedManagerContainer } from "@/lib/runtime-protection";

export async function runContainerUpdateApply(input: {
	userId: string;
	environmentId?: string;
	containerNames?: string[];
	respectPolicies?: boolean;
	updateOnlyRunning?: boolean;
	scheduleId?: string | null;
}) {
	const environment = await resolveRuntimeEnvironment(input.userId, input.environmentId);
	const runId = await createUpdateRun({
		userId: input.userId,
		environmentId: environment.id,
		runType: "update",
		scheduleId: input.scheduleId || null,
	});
	const respectPolicies = input.respectPolicies ?? false;
	const updateOnlyRunning = input.updateOnlyRunning ?? true;

	try {
		const { containers } = await listContainersForEnvironment(input.userId, environment.id);
		const requested = new Set(
			(input.containerNames || []).map((name) => name.trim()).filter(Boolean),
		);
		const targetContainers = containers.filter((container: Record<string, string>) => {
			const containerName = containerNameOf(container);
			if (!containerName) {
				return false;
			}
			if (!requested.size) {
				return true;
			}
			return requested.has(containerName);
		});
		const names = targetContainers
			.map((container: Record<string, string>) => containerNameOf(container))
			.filter(Boolean);
		const stateWhere =
			names.length > 0
				? and(
						eq(containerUpdateStates.environmentId, environment.id),
						eq(containerUpdateStates.createdByUserId, input.userId),
						inArray(containerUpdateStates.containerName, names),
					)
				: and(
						eq(containerUpdateStates.environmentId, environment.id),
						eq(containerUpdateStates.createdByUserId, input.userId),
					);
		const [policyRows, stateRows, stackRows] = await Promise.all([
			db.query.containerUpdatePolicies.findMany({
				where: and(
					eq(containerUpdatePolicies.environmentId, environment.id),
					eq(containerUpdatePolicies.createdByUserId, input.userId),
				),
			}),
			db.query.containerUpdateStates.findMany({
				where: stateWhere,
			}),
			db.query.stacks.findMany({
				where: and(
					eq(stacks.environmentId, environment.id),
					eq(stacks.createdByUserId, input.userId),
				),
				columns: { id: true, slug: true },
			}),
		]);

		const policies: ContainerUpdatePolicyMap = new Map(
			policyRows.map((row) => [
				row.containerName,
				{ id: row.id, checkEnabled: row.checkEnabled, updateEnabled: row.updateEnabled },
			]),
		);
		const states = new Map(stateRows.map((row) => [row.containerName, row]));
		const trackedStacksBySlug = new Map(stackRows.map((row) => [row.slug, row.id]));

		const summary: ContainerUpdateApplySummary = {
			totalContainers: targetContainers.length,
			updatedContainers: 0,
			queuedStacks: 0,
			skippedContainers: 0,
			failedContainers: 0,
		};
		const queuedStackIds: string[] = [];
		const stackContainers = new Map<string, Set<string>>();

		for (const container of targetContainers) {
			const containerName = containerNameOf(container);
			if (!containerName) {
				summary.skippedContainers += 1;
				continue;
			}
			if (environment.kind === "local" && isProtectedManagerContainer(container)) {
				summary.skippedContainers += 1;
				continue;
			}
			if (updateOnlyRunning && containerStateOf(container) !== "running") {
				summary.skippedContainers += 1;
				continue;
			}

			const policy = policies.get(containerName);
			if (respectPolicies && policy && !policy.updateEnabled) {
				summary.skippedContainers += 1;
				continue;
			}
			const state = states.get(containerName);
			if (!state?.updateAvailable) {
				summary.skippedContainers += 1;
				continue;
			}

			const composeProject = composeProjectOf(container);
			if (!composeProject) {
				summary.skippedContainers += 1;
				continue;
			}

			const trackedStackId = trackedStacksBySlug.get(composeProject);
			if (!trackedStackId) {
				summary.skippedContainers += 1;
				continue;
			}

			const namesForStack = stackContainers.get(trackedStackId) || new Set<string>();
			namesForStack.add(containerName);
			stackContainers.set(trackedStackId, namesForStack);
		}

		const successfullyQueuedContainerNames = new Set<string>();
		for (const [stackId, containerNames] of stackContainers.entries()) {
			try {
				await queueOrRunDeployment({
					stackId,
					userId: input.userId,
					operation: "deploy",
				});
				summary.queuedStacks += 1;
				queuedStackIds.push(stackId);
				for (const containerName of containerNames) {
					successfullyQueuedContainerNames.add(containerName);
				}
			} catch {
				summary.failedContainers += containerNames.size;
			}
		}

		const updateAt = now();
		for (const containerName of successfullyQueuedContainerNames) {
			summary.updatedContainers += 1;
			await upsertContainerUpdateState({
				userId: input.userId,
				environmentId: environment.id,
				containerName,
				updateAvailable: true,
				lastResult: "update_queued",
				updatedAt: updateAt,
			});
		}

		await completeUpdateRun({
			runId,
			status: "succeeded",
			summary: `Queued ${summary.queuedStacks} stack update(s).`,
			metrics: {
				totalContainers: summary.totalContainers,
				checkedContainers: 0,
				availableContainers: 0,
				queuedStacks: summary.queuedStacks,
				updatedContainers: summary.updatedContainers,
				skippedContainers: summary.skippedContainers,
				failedContainers: summary.failedContainers,
			},
		});

		return { environment, runId, queuedStackIds, ...summary };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Container update apply failed.";
		await completeUpdateRun({
			runId,
			status: "failed",
			summary: "Container update apply failed.",
			error: message,
			metrics: {
				totalContainers: 0,
				checkedContainers: 0,
				availableContainers: 0,
				queuedStacks: 0,
				updatedContainers: 0,
				skippedContainers: 0,
				failedContainers: 1,
			},
		});
		throw error;
	}
}
