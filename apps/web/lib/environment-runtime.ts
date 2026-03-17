import "server-only";

import { db, environments } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { ensureDefaultLocalEnvironment } from "@/lib/platform";
import type { CreateContainerInput } from "@/lib/platform/docker";
import {
	browseContainerPath,
	controlContainer,
	createContainer,
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

export class RuntimeConnectionError extends Error {
	code:
		| "remote_unavailable"
		| "agent_not_registered"
		| "agent_unauthorized"
		| "agent_request_failed";

	constructor(
		code:
			| "remote_unavailable"
			| "agent_not_registered"
			| "agent_unauthorized"
			| "agent_request_failed",
		message: string,
	) {
		super(message);
		this.name = "RuntimeConnectionError";
		this.code = code;
	}
}

export function isRuntimeConnectionError(error: unknown): error is RuntimeConnectionError {
	return error instanceof RuntimeConnectionError;
}

export function getRuntimeConnectionMessage(error: unknown) {
	if (error instanceof RuntimeConnectionError) {
		return error.message;
	}
	return error instanceof Error ? error.message : "Runtime connection is unavailable.";
}

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

		throw new Error("Environment not found.");
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
		throw new RuntimeConnectionError(
			"remote_unavailable",
			"Remote agent environment is not available.",
		);
	}

	const agent = environment.agent?.[0];
	if (!environment.managerUrl || !agent?.accessToken) {
		throw new RuntimeConnectionError("agent_not_registered", "Agent is not registered yet.");
	}

	let response: Response;
	try {
		response = await fetch(`${environment.managerUrl.replace(/\/$/, "")}${path}`, {
			...init,
			signal: init?.signal ?? AbortSignal.timeout(2500),
			headers: {
				Authorization: `Bearer ${agent.accessToken}`,
				...(init?.headers || {}),
			},
			cache: "no-store",
		});
	} catch {
		throw new RuntimeConnectionError(
			"remote_unavailable",
			"Remote agent is unreachable right now.",
		);
	}

	if (!response.ok) {
		throw new RuntimeConnectionError(
			response.status === 401 || response.status === 403
				? "agent_unauthorized"
				: "agent_request_failed",
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

async function fetchLocalTerminal(userId: string, path: string, init?: RequestInit) {
	const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3080}${path}`, {
		...init,
		headers: {
			"x-dockroot-internal-token": process.env.DOCKROOT_TOKEN_PEPPER || "",
			"x-dockroot-user-id": userId,
			...(init?.headers || {}),
		},
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(
			response.status === 404 ? "Terminal session not found." : "Local terminal request failed.",
		);
	}

	return response.json();
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

	const result = await fetchAgentJson(environment, "/containers", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	return result as { ok: boolean; output: string };
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
	target: "container";
	containerId?: string;
	shell?: "sh" | "bash" | "ash" | "zsh" | "custom";
	customShell?: string;
	cols?: number;
	rows?: number;
}) {
	const environment = await getEnvironmentRecord(input.environmentId, input.userId);
	if (environment.kind === "local") {
		return fetchLocalTerminal(input.userId, "/internal/local-terminal/sessions", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({
				target: input.target,
				containerId: input.containerId,
				userId: input.userId,
				shell: input.shell,
				customShell: input.customShell,
				cols: input.cols,
				rows: input.rows,
			}),
		});
	}

	return fetchAgentJson(environment, "/terminal/sessions", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			target: input.target,
			containerId: input.containerId,
			shell: input.shell,
			customShell: input.customShell,
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
	waitMs?: number,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return fetchLocalTerminal(
			userId,
			`/internal/local-terminal/sessions/${encodeURIComponent(sessionId)}?cursor=${Number(cursor || 0)}&waitMs=${Number(waitMs || 0)}`,
		);
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
		return fetchLocalTerminal(
			input.userId,
			`/internal/local-terminal/sessions/${encodeURIComponent(input.sessionId)}`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ type: "input", data: input.data }),
			},
		);
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
		return fetchLocalTerminal(
			input.userId,
			`/internal/local-terminal/sessions/${encodeURIComponent(input.sessionId)}`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ type: "resize", cols: input.cols, rows: input.rows }),
			},
		);
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
		return fetchLocalTerminal(
			userId,
			`/internal/local-terminal/sessions/${encodeURIComponent(sessionId)}`,
			{
				method: "DELETE",
			},
		);
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

export async function backupVolumeForEnvironment(
	userId: string,
	volumeName: string,
	backupId: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		const { backupVolume, getBackupFileSize } = await import("@/lib/platform/docker");
		const result = await backupVolume(volumeName, backupId);
		const sizeBytes = result.ok ? ((await getBackupFileSize(backupId)) ?? null) : null;
		return { ...result, sizeBytes };
	}

	return fetchAgentJson(environment, `/volumes/${encodeURIComponent(volumeName)}/backup`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ backupId }),
	}) as Promise<{ ok: boolean; fileName: string; sizeBytes: number | null; output: string }>;
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

	return fetchAgentJson(environment, `/volumes/${encodeURIComponent(volumeName)}/restore`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ backupId }),
	}) as Promise<{ ok: boolean; output: string }>;
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
