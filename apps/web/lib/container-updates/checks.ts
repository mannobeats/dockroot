import "server-only";

import { containerUpdatePolicies, db } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { checkContainerUpdate } from "@/lib/container-updates/check-container";
import { ensurePoliciesForContainers } from "@/lib/container-updates/policy";
import { completeUpdateRun, createUpdateRun } from "@/lib/container-updates/runs";
import { containerNameOf } from "@/lib/container-updates/shared";
import type {
	ContainerUpdateCheckSummary,
	ContainerUpdatePolicyMap,
} from "@/lib/container-updates/types";
import { listContainersForEnvironment, resolveRuntimeEnvironment } from "@/lib/environment-runtime";

function filterTargetContainers(
	containers: Record<string, string>[],
	containerNames: string[] | undefined,
) {
	const requested = new Set((containerNames || []).map((name) => name.trim()).filter(Boolean));

	return containers.filter((container) => {
		const containerName = containerNameOf(container);
		if (!containerName) {
			return false;
		}
		return !requested.size || requested.has(containerName);
	});
}

async function loadPolicyMap(
	userId: string,
	environmentId: string,
): Promise<ContainerUpdatePolicyMap> {
	const policyRows = await db.query.containerUpdatePolicies.findMany({
		where: and(
			eq(containerUpdatePolicies.environmentId, environmentId),
			eq(containerUpdatePolicies.createdByUserId, userId),
		),
	});

	return new Map(
		policyRows.map((row) => [
			row.containerName,
			{ id: row.id, checkEnabled: row.checkEnabled, updateEnabled: row.updateEnabled },
		]),
	);
}

function emptyCheckSummary(totalContainers: number): ContainerUpdateCheckSummary {
	return {
		totalContainers: totalContainers,
		checkedContainers: 0,
		availableContainers: 0,
		skippedContainers: 0,
		failedContainers: 0,
	};
}

export async function runContainerUpdateCheck(input: {
	userId: string;
	environmentId?: string;
	containerNames?: string[];
	respectPolicies?: boolean;
	pullBeforeCheck?: boolean;
	includeMajorVersions?: boolean;
	scheduleId?: string | null;
}) {
	const environment = await resolveRuntimeEnvironment(input.userId, input.environmentId);
	const runId = await createUpdateRun({
		userId: input.userId,
		environmentId: environment.id,
		runType: "check",
		scheduleId: input.scheduleId || null,
	});
	const pullBeforeCheck = input.pullBeforeCheck ?? true;
	const respectPolicies = input.respectPolicies ?? false;
	const includeMajorVersions = input.includeMajorVersions ?? false;

	try {
		const { containers } = await listContainersForEnvironment(input.userId, environment.id);
		await ensurePoliciesForContainers({
			userId: input.userId,
			environmentId: environment.id,
			containers,
		});

		const targetContainers = filterTargetContainers(containers, input.containerNames);
		const policies = await loadPolicyMap(input.userId, environment.id);
		const summary = emptyCheckSummary(targetContainers.length);

		for (const container of targetContainers) {
			const containerName = containerNameOf(container);
			if (!containerName) {
				summary.skippedContainers += 1;
				continue;
			}

			const policy = policies.get(containerName);
			const outcome = await checkContainerUpdate({
				userId: input.userId,
				environment,
				container,
				containerName,
				pullBeforeCheck,
				includeMajorVersions,
				policyCheckEnabled: policy?.checkEnabled ?? true,
				respectPolicies,
			});

			switch (outcome) {
				case "available":
					summary.availableContainers += 1;
					summary.checkedContainers += 1;
					break;
				case "checked":
					summary.checkedContainers += 1;
					break;
				case "skipped":
					summary.skippedContainers += 1;
					break;
				case "failed":
					summary.failedContainers += 1;
					break;
			}
		}

		await completeUpdateRun({
			runId,
			status: "succeeded",
			summary: `Checked ${summary.checkedContainers}/${summary.totalContainers} containers.`,
			metrics: {
				...summary,
				queuedStacks: 0,
				updatedContainers: 0,
			},
		});

		return { environment, runId, ...summary };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Container update check failed.";
		await completeUpdateRun({
			runId,
			status: "failed",
			summary: "Container update check failed.",
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
