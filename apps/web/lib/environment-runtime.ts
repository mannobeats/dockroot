import "server-only";

import { db, environments } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { ensureDefaultLocalEnvironment } from "@/lib/platform";
import {
	controlContainer,
	createNetwork,
	createVolume,
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

	return ensureDefaultLocalEnvironment(userId);
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
		const message = await response.text();
		throw new Error(message || `Agent request failed for ${path}`);
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
