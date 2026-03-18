import {
	digestSetFromImageInspect,
	hasContainerImageUpdate,
	latestImageReferenceForMajorCheck,
	normalizeDigest,
	parseImageReference,
} from "@/lib/container-updates/image-ref";
import {
	fetchRegistryManifestDigest,
	findDockerHubMajorTargetTag,
} from "@/lib/container-updates/registry";
import { imageIdOf, imageRefOf, now, runningImageIdOf } from "@/lib/container-updates/shared";
import { upsertContainerUpdateState } from "@/lib/container-updates/state";
import {
	getContainerDetailsForEnvironment,
	getImageDetailsForEnvironment,
	pullImageForEnvironment,
} from "@/lib/environment-runtime";
import { isProtectedManagerContainer } from "@/lib/runtime-protection";

export type ContainerCheckOutcome = "checked" | "available" | "skipped" | "failed";

interface CheckContainerUpdateInput {
	userId: string;
	environment: { id: string; kind: string };
	container: Record<string, string>;
	containerName: string;
	pullBeforeCheck: boolean;
	includeMajorVersions: boolean;
	policyCheckEnabled: boolean;
	respectPolicies: boolean;
}

export async function checkContainerUpdate({
	userId,
	environment,
	container,
	containerName,
	pullBeforeCheck,
	includeMajorVersions,
	policyCheckEnabled,
	respectPolicies,
}: CheckContainerUpdateInput): Promise<ContainerCheckOutcome> {
	if (respectPolicies && !policyCheckEnabled) {
		return "skipped";
	}

	if (environment.kind === "local" && isProtectedManagerContainer(container)) {
		await upsertContainerUpdateState({
			userId,
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
		return "skipped";
	}

	try {
		const details = await getContainerDetailsForEnvironment(userId, container.ID, environment.id);
		const inspect = (details.details?.inspect || null) as Record<string, unknown> | null;
		const imageRef = imageRefOf(container, inspect);
		const runningImageId = runningImageIdOf(inspect);

		if (!imageRef) {
			await upsertContainerUpdateState({
				userId,
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
			return "skipped";
		}

		if (pullBeforeCheck) {
			await pullImageForEnvironment(userId, imageRef, environment.id);
		}

		let runningImageInspect: Record<string, unknown> | null = null;
		if (runningImageId) {
			try {
				const runningImage = await getImageDetailsForEnvironment(
					userId,
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
			const latestImage = await getImageDetailsForEnvironment(userId, imageRef, environment.id);
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
						await pullImageForEnvironment(userId, latestRef, environment.id);
						const majorCandidate = await getImageDetailsForEnvironment(
							userId,
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
			userId,
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

		return updateAvailable ? "available" : "checked";
	} catch (error) {
		await upsertContainerUpdateState({
			userId,
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
		return "failed";
	}
}
