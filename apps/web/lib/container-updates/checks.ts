import "server-only";

import { containerUpdatePolicies, db } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import {
	digestSetFromImageInspect,
	hasContainerImageUpdate,
	latestImageReferenceForMajorCheck,
	normalizeDigest,
	parseImageReference,
} from "@/lib/container-updates/image-ref";
import { ensurePoliciesForContainers } from "@/lib/container-updates/policy";
import {
	fetchRegistryManifestDigest,
	findDockerHubMajorTargetTag,
} from "@/lib/container-updates/registry";
import { completeUpdateRun, createUpdateRun } from "@/lib/container-updates/runs";
import {
	containerNameOf,
	imageIdOf,
	imageRefOf,
	now,
	runningImageIdOf,
} from "@/lib/container-updates/shared";
import { upsertContainerUpdateState } from "@/lib/container-updates/state";
import type {
	ContainerUpdateCheckSummary,
	ContainerUpdatePolicyMap,
} from "@/lib/container-updates/types";
import {
	getContainerDetailsForEnvironment,
	getImageDetailsForEnvironment,
	listContainersForEnvironment,
	pullImageForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { isProtectedManagerContainer } from "@/lib/runtime-protection";

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
		const policyRows = await db.query.containerUpdatePolicies.findMany({
			where: and(
				eq(containerUpdatePolicies.environmentId, environment.id),
				eq(containerUpdatePolicies.createdByUserId, input.userId),
			),
		});
		const policies: ContainerUpdatePolicyMap = new Map(
			policyRows.map((row) => [
				row.containerName,
				{ id: row.id, checkEnabled: row.checkEnabled, updateEnabled: row.updateEnabled },
			]),
		);

		const summary: ContainerUpdateCheckSummary = {
			totalContainers: targetContainers.length,
			checkedContainers: 0,
			availableContainers: 0,
			skippedContainers: 0,
			failedContainers: 0,
		};

		for (const container of targetContainers) {
			const containerName = containerNameOf(container);
			if (!containerName) {
				summary.skippedContainers += 1;
				continue;
			}

			const policy = policies.get(containerName);
			if (respectPolicies && policy && !policy.checkEnabled) {
				summary.skippedContainers += 1;
				continue;
			}
			if (environment.kind === "local" && isProtectedManagerContainer(container)) {
				await upsertContainerUpdateState({
					userId: input.userId,
					environmentId: environment.id,
					containerName,
					containerId: container.ID,
					imageRef: container.Image || null,
					runningImageId: null,
					latestImageId: null,
					majorTargetImageRef: null,
					majorTargetTag: null,
					updateAvailable: false,
					majorUpdateAvailable: false,
					lastResult: "skipped",
					lastError: null,
					checkedAt: now(),
				});
				summary.skippedContainers += 1;
				continue;
			}

			try {
				const details = await getContainerDetailsForEnvironment(
					input.userId,
					container.ID,
					environment.id,
				);
				const inspect = (details.details?.inspect || null) as Record<string, unknown> | null;
				const imageRef = imageRefOf(container, inspect);
				const runningImageId = runningImageIdOf(inspect);
				if (!imageRef) {
					await upsertContainerUpdateState({
						userId: input.userId,
						environmentId: environment.id,
						containerName,
						containerId: container.ID,
						imageRef: null,
						runningImageId,
						latestImageId: null,
						majorTargetImageRef: null,
						majorTargetTag: null,
						updateAvailable: false,
						majorUpdateAvailable: false,
						lastResult: "skipped",
						lastError: "Container has no image reference.",
						checkedAt: now(),
					});
					summary.skippedContainers += 1;
					continue;
				}

				if (pullBeforeCheck) {
					await pullImageForEnvironment(input.userId, imageRef, environment.id);
				}
				let runningImageInspect: Record<string, unknown> | null = null;
				if (runningImageId) {
					try {
						const runningImage = await getImageDetailsForEnvironment(
							input.userId,
							runningImageId,
							environment.id,
						);
						runningImageInspect = (runningImage.image || null) as Record<string, unknown> | null;
					} catch {
						runningImageInspect = null;
					}
				}
				let latestImageId: string | null = null;
				let latestImageInspect: Record<string, unknown> | null = null;
				let updateAvailable = false;
				if (!pullBeforeCheck) {
					const remoteDigest = await fetchRegistryManifestDigest(imageRef);
					if (remoteDigest) {
						latestImageId = remoteDigest;
						const runningDigests = digestSetFromImageInspect(runningImageInspect);
						const normalizedRunningImageId = normalizeDigest(runningImageId || "");
						if (normalizedRunningImageId) {
							runningDigests.add(normalizedRunningImageId);
						}
						updateAvailable = !runningDigests.has(remoteDigest);
					}
				}
				if (!latestImageId) {
					const latestImage = await getImageDetailsForEnvironment(
						input.userId,
						imageRef,
						environment.id,
					);
					latestImageId = imageIdOf(latestImage.image);
					latestImageInspect = (latestImage.image || null) as Record<string, unknown> | null;
					updateAvailable = hasContainerImageUpdate({
						runningImageId,
						latestImageId,
						runningImageInspect,
						latestImageInspect,
					});
				}
				let majorUpdateAvailable = false;
				let majorTargetImageRef: string | null = null;
				let majorTargetTag: string | null = null;
				if (!updateAvailable && includeMajorVersions && runningImageId) {
					const latestRef = latestImageReferenceForMajorCheck(imageRef);
					if (latestRef) {
						try {
							majorTargetImageRef = latestRef;
							if (pullBeforeCheck) {
								await pullImageForEnvironment(input.userId, latestRef, environment.id);
								const majorCandidate = await getImageDetailsForEnvironment(
									input.userId,
									latestRef,
									environment.id,
								);
								const majorCandidateId = imageIdOf(majorCandidate.image);
								const majorCandidateInspect = (majorCandidate.image || null) as Record<
									string,
									unknown
								> | null;
								majorUpdateAvailable = hasContainerImageUpdate({
									runningImageId,
									latestImageId: majorCandidateId,
									runningImageInspect,
									latestImageInspect: majorCandidateInspect,
								});
							} else {
								const remoteDigest = await fetchRegistryManifestDigest(latestRef);
								if (remoteDigest) {
									const runningDigests = digestSetFromImageInspect(runningImageInspect);
									const normalizedRunningImageId = normalizeDigest(runningImageId || "");
									if (normalizedRunningImageId) {
										runningDigests.add(normalizedRunningImageId);
									}
									majorUpdateAvailable = !runningDigests.has(remoteDigest);
								}
							}
							if (majorUpdateAvailable) {
								const candidateTag = await findDockerHubMajorTargetTag(imageRef);
								if (candidateTag) {
									const parsedTarget = parseImageReference(imageRef);
									if (parsedTarget) {
										majorTargetTag = candidateTag;
										majorTargetImageRef = `${parsedTarget.repository}:${candidateTag}`;
									}
								}
							}
						} catch {
							majorUpdateAvailable = false;
							majorTargetImageRef = null;
							majorTargetTag = null;
						}
					}
				}
				const lastResult = updateAvailable
					? "available"
					: majorUpdateAvailable
						? "major_available"
						: "not_available";

				await upsertContainerUpdateState({
					userId: input.userId,
					environmentId: environment.id,
					containerName,
					containerId: container.ID,
					imageRef,
					runningImageId,
					latestImageId,
					majorTargetImageRef,
					majorTargetTag,
					updateAvailable,
					majorUpdateAvailable,
					lastResult,
					lastError: null,
					checkedAt: now(),
				});

				summary.checkedContainers += 1;
				if (updateAvailable) {
					summary.availableContainers += 1;
				}
			} catch (error) {
				await upsertContainerUpdateState({
					userId: input.userId,
					environmentId: environment.id,
					containerName,
					containerId: container.ID,
					imageRef: container.Image || null,
					runningImageId: null,
					latestImageId: null,
					majorTargetImageRef: null,
					majorTargetTag: null,
					updateAvailable: false,
					majorUpdateAvailable: false,
					lastResult: "check_failed",
					lastError: error instanceof Error ? error.message : "Check failed.",
					checkedAt: now(),
				});
				summary.failedContainers += 1;
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
