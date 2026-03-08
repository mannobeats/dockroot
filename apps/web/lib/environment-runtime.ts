import "server-only";

import { db, environments } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { ensureDefaultLocalEnvironment } from "@/lib/platform";
import {
	browseContainerPath,
	controlContainer,
	createNetwork,
	createVolume,
	deleteContainerPath,
	getContainerDetails,
	getContainerLogs,
	getImageDetails,
	getLocalDockerSnapshot,
	getNetworkDetails,
	getVolumeDetails,
	listContainers,
	listImages,
	listNetworks,
	listVolumes,
	pruneImages,
	pruneNetworks,
	pruneVolumes,
	pullImage,
	removeImage,
	removeNetwork,
	removeVolume,
	uploadContainerFile,
	writeContainerFile,
} from "@/lib/platform/docker";

async function getEnvironmentRecord(environmentId: string | undefined, userId: string) {
	if (environmentId) {
		const environment = await db.query.environments.findFirst({
			where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
			with: {
				agent: true,
			},
		});

		if (environment) {
			return environment;
		}
	}

	const fallback = await ensureDefaultLocalEnvironment(userId);
	if (!fallback) {
		throw new Error("No runtime environment is available for this user.");
	}

	return fallback;
}

async function fetchAgent(
	environment: Awaited<ReturnType<typeof getEnvironmentRecord>>,
	path: string,
	init?: RequestInit,
) {
	if (!environment || environment.kind !== "agent") {
		throw new Error("Remote agent environment is not available.");
	}

	const agent = environment.agent?.[0];
	if (!environment.managerUrl || !agent?.accessToken) {
		throw new Error("Agent is not registered yet.");
	}

	const response = await fetch(`${environment.managerUrl.replace(/\/$/, "")}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${agent.accessToken}`,
			...(init?.headers || {}),
		},
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(
			response.status === 401 || response.status === 403
				? "Agent request was not authorized."
				: `Agent request failed for ${path}.`,
		);
	}

	return response;
}

async function fetchAgentJson(
	environment: Awaited<ReturnType<typeof getEnvironmentRecord>>,
	path: string,
	init?: RequestInit,
) {
	return (await fetchAgent(environment, path, init)).json();
}

async function fetchAgentText(
	environment: Awaited<ReturnType<typeof getEnvironmentRecord>>,
	path: string,
	init?: RequestInit,
) {
	return (await fetchAgent(environment, path, init)).text();
}

export async function resolveRuntimeEnvironment(userId: string, environmentId?: string) {
	return getEnvironmentRecord(environmentId, userId);
}

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
		snapshot: await fetchAgentJson(environment, "/snapshot"),
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
		containers: await fetchAgentJson(environment, "/containers"),
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
		details: await fetchAgentJson(environment, `/containers/${encodeURIComponent(containerId)}`),
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
}) {
	const environment = await getEnvironmentRecord(input.environmentId, input.userId);
	if (environment.kind === "local") {
		return controlContainer(input.containerId, input.action);
	}

	await fetchAgent(environment, `/containers/${encodeURIComponent(input.containerId)}/actions`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ action: input.action }),
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
		browser: await fetchAgentJson(
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

	return fetchAgentJson(environment, `/containers/${encodeURIComponent(containerId)}/files`, {
		method: "PUT",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ path: targetPath, content }),
	});
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

	return fetchAgentJson(environment, `/containers/${encodeURIComponent(containerId)}/files`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			path: targetDirectory,
			fileName,
			contentBase64: content.toString("base64"),
		}),
	});
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

	return fetchAgentJson(environment, `/containers/${encodeURIComponent(containerId)}/files`, {
		method: "DELETE",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ path: targetPath }),
	});
}

export async function createTerminalSessionForEnvironment(input: {
	userId: string;
	environmentId?: string;
	target: "host" | "container";
	containerId?: string;
	cols?: number;
	rows?: number;
}) {
	const environment = await getEnvironmentRecord(input.environmentId, input.userId);
	if (environment.kind === "local") {
		throw new Error("Local terminal sessions are handled through the manager socket.");
	}

	return fetchAgentJson(environment, "/terminal/sessions", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			target: input.target,
			containerId: input.containerId,
			cols: input.cols,
			rows: input.rows,
		}),
	});
}

export async function readTerminalSessionForEnvironment(
	userId: string,
	sessionId: string,
	environmentId?: string,
	cursor?: number,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		throw new Error("Local terminal sessions are handled through the manager socket.");
	}

	return fetchAgentJson(
		environment,
		`/terminal/sessions/${encodeURIComponent(sessionId)}?cursor=${Number(cursor || 0)}`,
	);
}

export async function writeTerminalInputForEnvironment(input: {
	userId: string;
	environmentId?: string;
	sessionId: string;
	data: string;
}) {
	const environment = await getEnvironmentRecord(input.environmentId, input.userId);
	if (environment.kind === "local") {
		throw new Error("Local terminal sessions are handled through the manager socket.");
	}

	return fetchAgentJson(environment, `/terminal/sessions/${encodeURIComponent(input.sessionId)}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ type: "input", data: input.data }),
	});
}

export async function resizeTerminalSessionForEnvironment(input: {
	userId: string;
	environmentId?: string;
	sessionId: string;
	cols: number;
	rows: number;
}) {
	const environment = await getEnvironmentRecord(input.environmentId, input.userId);
	if (environment.kind === "local") {
		throw new Error("Local terminal sessions are handled through the manager socket.");
	}

	return fetchAgentJson(environment, `/terminal/sessions/${encodeURIComponent(input.sessionId)}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ type: "resize", cols: input.cols, rows: input.rows }),
	});
}

export async function closeTerminalSessionForEnvironment(
	userId: string,
	sessionId: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		throw new Error("Local terminal sessions are handled through the manager socket.");
	}

	return fetchAgentJson(environment, `/terminal/sessions/${encodeURIComponent(sessionId)}`, {
		method: "DELETE",
	});
}

export async function listImagesForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			images: await listImages(),
		};
	}

	return {
		environment,
		images: await fetchAgentJson(environment, "/images"),
	};
}

export async function getImageDetailsForEnvironment(
	userId: string,
	imageRef: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			image: await getImageDetails(imageRef),
		};
	}

	return {
		environment,
		image: await fetchAgentJson(environment, `/images/${encodeURIComponent(imageRef)}`),
	};
}

export async function pullImageForEnvironment(
	userId: string,
	imageRef: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return pullImage(imageRef);
	}

	await fetchAgent(environment, "/images/pull", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ imageRef }),
	});
}

export async function removeImageForEnvironment(
	userId: string,
	imageRef: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return removeImage(imageRef);
	}

	await fetchAgent(environment, "/images/remove", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ imageRef }),
	});
}

export async function pruneImagesForEnvironment(
	userId: string,
	environmentId?: string,
	options?: { all?: boolean },
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return pruneImages(options);
	}

	await fetchAgent(environment, "/images/prune", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(options || {}),
	});
}

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
		volumes: await fetchAgentJson(environment, "/volumes"),
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
		volume: await fetchAgentJson(environment, `/volumes/${encodeURIComponent(volumeName)}`),
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

export async function listNetworksForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			networks: await listNetworks(),
		};
	}

	return {
		environment,
		networks: await fetchAgentJson(environment, "/networks"),
	};
}

export async function getNetworkDetailsForEnvironment(
	userId: string,
	networkName: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			network: await getNetworkDetails(networkName),
		};
	}

	return {
		environment,
		network: await fetchAgentJson(environment, `/networks/${encodeURIComponent(networkName)}`),
	};
}

export async function createNetworkForEnvironment(
	userId: string,
	name: string,
	driver: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return createNetwork(name, driver);
	}

	await fetchAgent(environment, "/networks/create", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ name, driver }),
	});
}

export async function removeNetworkForEnvironment(
	userId: string,
	name: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return removeNetwork(name);
	}

	await fetchAgent(environment, "/networks/remove", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ name }),
	});
}

export async function pruneNetworksForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return pruneNetworks();
	}

	await fetchAgent(environment, "/networks/prune", {
		method: "POST",
	});
}
