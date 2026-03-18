import "server-only";

import { getEnvironmentRecord } from "@/lib/environment-runtime/environment";
import { fetchAgent, fetchAgentJson } from "@/lib/environment-runtime/remote-agent";
import {
	createVolume,
	getBackupFileSize,
	getVolumeDetails,
	listVolumes,
	pruneVolumes,
	removeVolume,
} from "@/lib/platform/docker";

type VolumeList = Awaited<ReturnType<typeof listVolumes>>;
type VolumeDetails = Awaited<ReturnType<typeof getVolumeDetails>>;

export async function listVolumesForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			volumes: await listVolumes(),
		};
	}

	return {
		environment,
		volumes: await fetchAgentJson<VolumeList>(environment, "/volumes"),
	};
}

export async function getVolumeDetailsForEnvironment(
	userId: string,
	volumeName: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			volume: await getVolumeDetails(volumeName),
		};
	}

	return {
		environment,
		volume: await fetchAgentJson<VolumeDetails>(
			environment,
			`/volumes/${encodeURIComponent(volumeName)}`,
		),
	};
}

export async function createVolumeForEnvironment(
	userId: string,
	name: string,
	driver: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return createVolume(name, driver);
	}

	await fetchAgent(environment, "/volumes/create", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ name, driver }),
	});
}

export async function removeVolumeForEnvironment(
	userId: string,
	name: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return removeVolume(name);
	}

	await fetchAgent(environment, "/volumes/remove", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ name }),
	});
}

export async function pruneVolumesForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return pruneVolumes();
	}

	await fetchAgent(environment, "/volumes/prune", {
		method: "POST",
	});
}

export async function backupVolumeForEnvironment(
	userId: string,
	volumeName: string,
	backupId: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		const { backupVolume } = await import("@/lib/platform/docker");
		const result = await backupVolume(volumeName, backupId);
		const sizeBytes = result.ok ? ((await getBackupFileSize(backupId)) ?? null) : null;
		return { ...result, sizeBytes };
	}

	return fetchAgentJson<{
		ok: boolean;
		fileName: string;
		sizeBytes: number | null;
		output: string;
	}>(environment, `/volumes/${encodeURIComponent(volumeName)}/backup`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ backupId }),
	});
}

export async function restoreVolumeForEnvironment(
	userId: string,
	volumeName: string,
	backupId: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		const { restoreVolume } = await import("@/lib/platform/docker");
		return restoreVolume(volumeName, backupId);
	}

	return fetchAgentJson<{ ok: boolean; output: string }>(
		environment,
		`/volumes/${encodeURIComponent(volumeName)}/restore`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ backupId }),
		},
	);
}

export async function deleteVolumeBackupForEnvironment(
	userId: string,
	backupId: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		const { deleteBackupFile } = await import("@/lib/platform/docker");
		return deleteBackupFile(backupId);
	}

	await fetchAgent(environment, `/backups/${encodeURIComponent(backupId)}`, {
		method: "DELETE",
	});
}
