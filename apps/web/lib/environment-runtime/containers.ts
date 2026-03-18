import "server-only";

import { getEnvironmentRecord } from "@/lib/environment-runtime/environment";
import { fetchAgent, fetchAgentJson, fetchAgentText } from "@/lib/environment-runtime/remote-agent";
import type { ContainerBrowserResult, CreateContainerInput } from "@/lib/platform/docker";
import {
	browseContainerPath,
	controlContainer,
	createContainer,
	deleteContainerPath,
	getContainerDetails,
	getContainerLogs,
	getLocalDockerSnapshot,
	listContainers,
	uploadContainerFile,
	writeContainerFile,
} from "@/lib/platform/docker";

type RuntimeSnapshot = Awaited<ReturnType<typeof getLocalDockerSnapshot>>;
type ContainerList = Awaited<ReturnType<typeof listContainers>>;
type ContainerDetails = Awaited<ReturnType<typeof getContainerDetails>>;
type ContainerFileWriteResult = Awaited<ReturnType<typeof writeContainerFile>>;
type ContainerFileUploadResult = Awaited<ReturnType<typeof uploadContainerFile>>;
type ContainerFileDeleteResult = Awaited<ReturnType<typeof deleteContainerPath>>;

export async function getRuntimeSnapshotForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);

	if (environment.kind === "local") {
		return {
			environment,
			snapshot: await getLocalDockerSnapshot(),
		};
	}

	return {
		environment,
		snapshot: await fetchAgentJson<RuntimeSnapshot>(environment, "/snapshot"),
	};
}

export async function listContainersForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			containers: await listContainers(),
		};
	}

	return {
		environment,
		containers: await fetchAgentJson<ContainerList>(environment, "/containers"),
	};
}

export async function getContainerDetailsForEnvironment(
	userId: string,
	containerId: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			details: await getContainerDetails(containerId),
		};
	}

	return {
		environment,
		details: await fetchAgentJson<ContainerDetails>(
			environment,
			`/containers/${encodeURIComponent(containerId)}`,
		),
	};
}

export async function getContainerLogsForEnvironment(
	userId: string,
	containerId: string,
	environmentId?: string,
	options?: { tail?: number },
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			logs: await getContainerLogs(containerId, options),
		};
	}

	return {
		environment,
		logs: await fetchAgentText(
			environment,
			`/containers/${encodeURIComponent(containerId)}/logs?tail=${options?.tail || 150}`,
		),
	};
}

export async function controlContainerForEnvironment(input: {
	userId: string;
	environmentId?: string;
	containerId: string;
	action: "start" | "stop" | "restart" | "remove";
	removeVolumes?: boolean;
	containerName?: string;
}) {
	const environment = await getEnvironmentRecord(input.environmentId, input.userId);
	if (environment.kind === "local") {
		return controlContainer(input.containerId, input.action, {
			removeVolumes: input.removeVolumes,
			auditContext: {
				userId: input.userId,
				environmentId: environment.id,
				containerName: input.containerName,
			},
		});
	}

	await fetchAgent(environment, `/containers/${encodeURIComponent(input.containerId)}/actions`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ action: input.action, removeVolumes: input.removeVolumes }),
	});
}

export async function createContainerForEnvironment(
	userId: string,
	input: CreateContainerInput,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return createContainer(input);
	}

	return fetchAgentJson<{ ok: boolean; output: string }>(environment, "/containers", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
}

export async function browseContainerPathForEnvironment(
	userId: string,
	containerId: string,
	targetPath: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			browser: await browseContainerPath(containerId, targetPath),
		};
	}

	return {
		environment,
		browser: await fetchAgentJson<ContainerBrowserResult>(
			environment,
			`/containers/${encodeURIComponent(containerId)}/files?path=${encodeURIComponent(targetPath)}`,
		),
	};
}

export async function writeContainerFileForEnvironment(
	userId: string,
	containerId: string,
	targetPath: string,
	content: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return writeContainerFile(containerId, targetPath, content);
	}

	return fetchAgentJson<ContainerFileWriteResult>(
		environment,
		`/containers/${encodeURIComponent(containerId)}/files`,
		{
			method: "PUT",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({ path: targetPath, content }),
		},
	);
}

export async function uploadContainerFileForEnvironment(
	userId: string,
	containerId: string,
	targetDirectory: string,
	fileName: string,
	content: Buffer,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return uploadContainerFile(containerId, targetDirectory, fileName, content);
	}

	return fetchAgentJson<ContainerFileUploadResult>(
		environment,
		`/containers/${encodeURIComponent(containerId)}/files`,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				path: targetDirectory,
				fileName,
				contentBase64: content.toString("base64"),
			}),
		},
	);
}

export async function deleteContainerPathForEnvironment(
	userId: string,
	containerId: string,
	targetPath: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return deleteContainerPath(containerId, targetPath);
	}

	return fetchAgentJson<ContainerFileDeleteResult>(
		environment,
		`/containers/${encodeURIComponent(containerId)}/files`,
		{
			method: "DELETE",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({ path: targetPath }),
		},
	);
}
