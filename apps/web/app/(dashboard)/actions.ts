"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
	isPrivilegedRole,
	requirePrivilegedSession,
	requireUserSession,
} from "@/lib/authorization";
import {
	getOrCreateContainerUpdateSchedule,
	runContainerUpdateApply,
	runContainerUpdateCheck,
	setContainerUpdatePolicy,
	updateContainerUpdateSchedule,
} from "@/lib/container-updates";
import {
	controlContainerForEnvironment,
	createContainerForEnvironment,
	createNetworkForEnvironment,
	createVolumeForEnvironment,
	listContainersForEnvironment,
	pruneImagesForEnvironment,
	pruneNetworksForEnvironment,
	pruneVolumesForEnvironment,
	pullImageForEnvironment,
	removeImageForEnvironment,
	removeNetworkForEnvironment,
	removeVolumeForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import {
	adoptComposeProject,
	createEnvironment,
	createGitHubStack,
	createStack,
	deleteEnvironment,
	deleteStack,
	getStackById,
	queueOrRunDeployment,
	rotateAgentRegistrationToken,
	updateEnvironment,
	updateGlobalSettings,
	updateStackConfig,
} from "@/lib/platform";
import { controlComposeProject, listContainers } from "@/lib/platform/docker";
import {
	listAccessibleContainersForUser,
	requireAccessibleContainerForUser,
} from "@/lib/runtime-access";
import {
	isProtectedManagerContainer,
	isProtectedManagerImage,
	isProtectedManagerStack,
} from "@/lib/runtime-protection";

function getValue(formData: FormData, key: string) {
	return String(formData.get(key) || "").trim();
}

function getBoolValue(formData: FormData, key: string) {
	const value = getValue(formData, key).trim().toLowerCase();
	if (!value) {
		return false;
	}
	if (["true", "1", "yes", "on", "enabled"].includes(value)) {
		return true;
	}
	if (["false", "0", "no", "off", "disabled"].includes(value)) {
		return false;
	}
	// Fallback for plain checkbox semantics where key is present without explicit "false".
	return true;
}

function getValues(formData: FormData, key: string) {
	return formData
		.getAll(key)
		.map((value) => String(value).trim())
		.filter(Boolean);
}

function parseJsonValue<T>(formData: FormData, key: string): T | null {
	const raw = getValue(formData, key);
	if (!raw) {
		return null;
	}
	try {
		return JSON.parse(raw) as T;
	} catch {
		throw new Error(`Invalid ${key} payload`);
	}
}

function requireDestructiveConfirmation(formData: FormData) {
	if (getValue(formData, "__confirmDestructive") !== "yes") {
		throw new Error("Confirmation is required for destructive actions.");
	}
}

function normalizeInUseDeleteError(
	resource: "image" | "volume" | "network",
	target: string,
	error: unknown,
) {
	const message = error instanceof Error ? error.message : String(error || "");
	const lower = message.toLowerCase();
	if (resource === "image") {
		if (
			lower.includes("being used by running container") ||
			lower.includes("being used by stopped container") ||
			lower.includes("image is being used")
		) {
			return new Error(`Cannot delete image ${target}: it is in use by one or more containers.`);
		}
	}
	if (resource === "volume") {
		if (lower.includes("volume is in use") || lower.includes("has active mounts")) {
			return new Error(
				`Cannot delete volume ${target}: it is currently attached to one or more containers.`,
			);
		}
	}
	if (resource === "network") {
		if (lower.includes("has active endpoints") || lower.includes("resource is in use")) {
			return new Error(
				`Cannot delete network ${target}: one or more containers are still connected to it.`,
			);
		}
	}
	return error instanceof Error ? error : new Error(message || "Action failed.");
}

function getContainerDisplayName(container: Record<string, string>) {
	return container.Names || container.Name || container.ID?.slice(0, 12) || "container";
}

function listContainersUsingImage(containers: Record<string, string>[], imageRef: string) {
	return containers
		.filter((container) => (container.Image || "").trim() === imageRef)
		.map(getContainerDisplayName);
}

export async function adoptComposeProjectAction(formData: FormData) {
	const { userId } = await requirePrivilegedSession();
	const projectName = getValue(formData, "projectName");
	const configFiles = formData
		.getAll("configFiles")
		.map((value) => String(value).trim())
		.filter(Boolean);

	const stackId = await adoptComposeProject({
		userId,
		projectName,
		configFiles,
	});

	revalidatePath("/dashboard/stacks");
	redirect(`/dashboard/stacks?adopted=${stackId}`);
}

export async function createEnvironmentAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const name = getValue(formData, "name");
	const description = getValue(formData, "description");
	const agentUrl = getValue(formData, "agentUrl");

	if (!name) {
		throw new Error("Environment name is required");
	}

	const environmentId = await createEnvironment({
		userId,
		name,
		description,
		agentUrl,
	});
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		userId,
		actionType: "environment.create",
		details: {
			environmentName: name,
			description: description || null,
			agentUrl: agentUrl || null,
		},
	});

	redirect(`/dashboard/environments/${environmentId}`);
}

export async function rotateAgentRegistrationTokenAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");

	if (!environmentId) {
		throw new Error("Environment is required");
	}

	await rotateAgentRegistrationToken({
		environmentId,
		userId,
	});

	redirect(`/dashboard/environments/${environmentId}`);
}

export async function deleteEnvironmentAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");

	if (!environmentId) {
		throw new Error("Environment is required");
	}

	await deleteEnvironment({
		environmentId,
		userId,
	});
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		userId,
		actionType: "environment.delete",
		details: { environmentId },
	});

	redirect("/dashboard/environments");
}

export async function updateEnvironmentAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");
	const name = getValue(formData, "name");
	const description = getValue(formData, "description");

	if (!environmentId || !name) {
		throw new Error("Environment and name are required");
	}

	await updateEnvironment({
		environmentId,
		userId,
		name,
		description,
	});

	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId,
		actionType: "environment.update",
		details: { environmentId, environmentName: name, description: description || null },
	});

	redirect(`/dashboard/environments/${environmentId}`);
}

export async function createStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");
	const name = getValue(formData, "name");
	const description = getValue(formData, "description");
	const composeYaml = getValue(formData, "composeYaml");
	const envFileContent = getValue(formData, "envFileContent");

	if (!environmentId || !name || !composeYaml) {
		throw new Error("Environment, stack name, and compose YAML are required");
	}

	await createStack({
		userId,
		environmentId,
		name,
		description,
		composeYaml,
		envFileContent,
	});
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId,
		actionType: "stack.create",
		details: { stackName: name, sourceType: "manual" },
	});

	redirect(`/dashboard/stacks?environment=${encodeURIComponent(environmentId)}`);
}

export async function createGitHubStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");
	const installationId = getValue(formData, "installationId");
	const repositoryId = getValue(formData, "repositoryId");
	const owner = getValue(formData, "owner");
	const repository = getValue(formData, "repository");
	const branch = getValue(formData, "branch");
	const composePath = getValue(formData, "composePath");
	const envPath = getValue(formData, "envPath");
	const composeYaml = getValue(formData, "composeYaml");
	const envFileContent = getValue(formData, "envFileContent");
	const autoDeployEnabled = getBoolValue(formData, "autoDeployEnabled");
	const autoDeployPaths = getValue(formData, "autoDeployPaths");
	const name = getValue(formData, "name") || repository;
	const description = getValue(formData, "description");

	if (!environmentId || !installationId || !owner || !repository || !branch || !composePath) {
		throw new Error("Environment, installation, repository, branch, and compose path are required");
	}

	await createGitHubStack({
		userId,
		environmentId,
		installationId,
		repositoryId,
		owner,
		repository,
		branch,
		composePath,
		envPath: envPath || undefined,
		composeYaml,
		envFileContent,
		name,
		description,
		autoDeployEnabled,
		autoDeployPaths: autoDeployPaths || undefined,
	});
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId,
		actionType: "stack.create",
		details: {
			stackName: name,
			sourceType: "github",
			repository: `${owner}/${repository}`,
			branch,
			composePath,
		},
	});

	redirect("/dashboard/stacks");
}

export async function deployStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const stackId = getValue(formData, "stackId");

	if (!stackId) {
		throw new Error("Stack is required");
	}

	const stack = await getStackById({ stackId, userId });
	if (!stack) {
		throw new Error("Stack not found");
	}
	if (isProtectedManagerStack(stack.slug)) {
		throw new Error("Dockroot platform stacks are locked and cannot be controlled from the UI.");
	}

	await queueOrRunDeployment({
		stackId,
		userId,
		operation: "deploy",
	});
}

export async function bulkDeployStacksAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const stackIds = getValues(formData, "stackIds");
	if (!stackIds.length) {
		throw new Error("At least one stack is required.");
	}

	for (const stackId of Array.from(new Set(stackIds))) {
		const stack = await getStackById({ stackId, userId });
		if (!stack || isProtectedManagerStack(stack.slug)) {
			continue;
		}
		await queueOrRunDeployment({
			stackId,
			userId,
			operation: "deploy",
		});
	}
	revalidatePath("/dashboard/stacks");
}

export async function bulkRestartStacksAction(formData: FormData) {
	const auth = await requireUserSession();
	const stackIds = getValues(formData, "stackIds");
	const projects =
		parseJsonValue<BulkComposeProjectInput[]>(formData, "projects")?.filter(
			(project) => project?.projectName,
		) || [];

	if (!stackIds.length && !projects.length) {
		throw new Error("Select at least one stack.");
	}
	if (projects.length && !isPrivilegedRole(auth.role)) {
		throw new Error("Only owners/admins can control untracked compose stacks.");
	}

	for (const stackId of Array.from(new Set(stackIds))) {
		const stack = await getStackById({ stackId, userId: auth.userId });
		if (!stack || isProtectedManagerStack(stack.slug)) {
			continue;
		}
		await queueOrRunDeployment({
			stackId,
			userId: auth.userId,
			operation: "deploy",
		});
	}

	for (const project of projects) {
		if (isProtectedManagerStack(project.projectName)) {
			continue;
		}
		await controlComposeProject(
			project.projectName,
			project.configFiles?.filter(Boolean) || [],
			"restart",
		);
	}

	revalidatePath("/dashboard/stacks");
}

export async function bulkStopStacksAction(formData: FormData) {
	const auth = await requireUserSession();
	const stackIds = getValues(formData, "stackIds");
	const projects =
		parseJsonValue<BulkComposeProjectInput[]>(formData, "projects")?.filter(
			(project) => project?.projectName,
		) || [];

	if (!stackIds.length && !projects.length) {
		throw new Error("Select at least one stack.");
	}
	if (projects.length && !isPrivilegedRole(auth.role)) {
		throw new Error("Only owners/admins can control untracked compose stacks.");
	}

	for (const stackId of Array.from(new Set(stackIds))) {
		const stack = await getStackById({ stackId, userId: auth.userId });
		if (!stack || isProtectedManagerStack(stack.slug)) {
			continue;
		}
		await queueOrRunDeployment({
			stackId,
			userId: auth.userId,
			operation: "destroy",
		});
	}

	for (const project of projects) {
		if (isProtectedManagerStack(project.projectName)) {
			continue;
		}
		await controlComposeProject(
			project.projectName,
			project.configFiles?.filter(Boolean) || [],
			"stop",
		);
	}

	revalidatePath("/dashboard/stacks");
}

export async function updateStackConfigAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const stackId = getValue(formData, "stackId");
	const composeYaml = getValue(formData, "composeYaml");
	const envFileContent = getValue(formData, "envFileContent");
	const mode = getValue(formData, "mode");

	if (!stackId || !composeYaml) {
		throw new Error("Stack and compose YAML are required");
	}

	const stack = await getStackById({ stackId, userId });
	if (!stack) {
		throw new Error("Stack not found");
	}
	if (isProtectedManagerStack(stack.slug)) {
		throw new Error("Dockroot platform stacks are locked and cannot be edited from the UI.");
	}

	await updateStackConfig({
		stackId,
		userId,
		composeYaml,
		envFileContent,
	});

	if (mode === "redeploy") {
		await queueOrRunDeployment({
			stackId,
			userId,
			operation: "deploy",
		});
	}
}

export async function destroyStackAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const { userId } = await requireUserSession();
	const stackId = getValue(formData, "stackId");

	if (!stackId) {
		throw new Error("Stack is required");
	}

	const stack = await getStackById({ stackId, userId });
	if (!stack) {
		throw new Error("Stack not found");
	}
	if (isProtectedManagerStack(stack.slug)) {
		throw new Error("Dockroot platform stacks are locked and cannot be destroyed from the UI.");
	}

	await queueOrRunDeployment({
		stackId,
		userId,
		operation: "destroy",
	});
}

export async function bulkDestroyStacksAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requireUserSession();
	const stackIds = getValues(formData, "stackIds");
	const projects =
		parseJsonValue<BulkComposeProjectInput[]>(formData, "projects")?.filter(
			(project) => project?.projectName,
		) || [];

	if (!stackIds.length && !projects.length) {
		throw new Error("Select at least one stack.");
	}
	if (projects.length && !isPrivilegedRole(auth.role)) {
		throw new Error("Only owners/admins can control untracked compose stacks.");
	}

	for (const stackId of Array.from(new Set(stackIds))) {
		const stack = await getStackById({ stackId, userId: auth.userId });
		if (!stack || isProtectedManagerStack(stack.slug)) {
			continue;
		}
		await queueOrRunDeployment({
			stackId,
			userId: auth.userId,
			operation: "destroy",
		});
	}

	for (const project of projects) {
		if (isProtectedManagerStack(project.projectName)) {
			continue;
		}
		await controlComposeProject(
			project.projectName,
			project.configFiles?.filter(Boolean) || [],
			"destroy",
		);
	}
	revalidatePath("/dashboard/stacks");
}

type BulkComposeProjectInput = {
	projectName: string;
	configFiles?: string[];
};

export async function bulkControlComposeProjectsAction(formData: FormData) {
	await requirePrivilegedSession();
	const action = getValue(formData, "action");
	const removeVolumes = getBoolValue(formData, "removeVolumes");
	const removeImages = getBoolValue(formData, "removeImages");
	const projects =
		parseJsonValue<BulkComposeProjectInput[]>(formData, "projects")?.filter(
			(project) => project?.projectName,
		) || [];

	if (!projects.length || !["start", "stop", "restart", "destroy"].includes(action)) {
		throw new Error("Projects and action are required");
	}
	if (action === "destroy") {
		requireDestructiveConfirmation(formData);
	}

	for (const project of projects) {
		if (isProtectedManagerStack(project.projectName)) {
			continue;
		}
		await controlComposeProject(
			project.projectName,
			project.configFiles?.filter(Boolean) || [],
			action as "start" | "stop" | "restart" | "destroy",
			{ removeVolumes, removeImages },
		);
	}
	revalidatePath("/dashboard/stacks");
}

export async function bulkAdoptComposeProjectsAction(formData: FormData) {
	const { userId } = await requirePrivilegedSession();
	const projects =
		parseJsonValue<BulkComposeProjectInput[]>(formData, "projects")?.filter(
			(project) => project?.projectName,
		) || [];

	if (!projects.length) {
		throw new Error("At least one compose project is required.");
	}

	for (const project of projects) {
		if (isProtectedManagerStack(project.projectName)) {
			continue;
		}
		await adoptComposeProject({
			userId,
			projectName: project.projectName,
			configFiles: project.configFiles?.filter(Boolean) || [],
		});
	}
	revalidatePath("/dashboard/stacks");
}

export async function bulkRemoveStacksAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requireUserSession();
	const stackIds = getValues(formData, "stackIds");
	const projects =
		parseJsonValue<BulkComposeProjectInput[]>(formData, "projects")?.filter(
			(project) => project?.projectName,
		) || [];

	if (!stackIds.length && !projects.length) {
		throw new Error("Select at least one stack.");
	}
	if (projects.length && !isPrivilegedRole(auth.role)) {
		throw new Error("Only owners/admins can control untracked compose stacks.");
	}

	for (const stackId of Array.from(new Set(stackIds))) {
		const stack = await getStackById({ stackId, userId: auth.userId });
		if (!stack || isProtectedManagerStack(stack.slug)) {
			continue;
		}
		await deleteStack({
			stackId,
			userId: auth.userId,
		});
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			environmentId: stack.environment?.id,
			userId: auth.userId,
			actionType: "stack.delete",
			details: { stackName: stack.name, stackId },
		});
	}

	for (const project of projects) {
		if (isProtectedManagerStack(project.projectName)) {
			continue;
		}
		await controlComposeProject(
			project.projectName,
			project.configFiles?.filter(Boolean) || [],
			"destroy",
			{ removeVolumes: true, removeImages: true },
		);
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			userId: auth.userId,
			actionType: "compose.destroy",
			details: {
				projectName: project.projectName,
				configFiles: project.configFiles?.filter(Boolean) || [],
				removeVolumes: true,
				removeImages: true,
			},
		});
	}

	revalidatePath("/dashboard/stacks");
}

export async function deleteStackAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const { userId } = await requireUserSession();
	const stackId = getValue(formData, "stackId");

	if (!stackId) {
		throw new Error("Stack is required");
	}

	const stack = await getStackById({ stackId, userId });
	if (!stack) {
		throw new Error("Stack not found");
	}
	if (isProtectedManagerStack(stack.slug)) {
		throw new Error("Dockroot platform stacks are locked and cannot be deleted from the UI.");
	}

	await deleteStack({
		stackId,
		userId,
	});
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId: stack.environment?.id,
		userId,
		actionType: "stack.delete",
		status: "success",
		details: { stackName: stack.name, stackId },
	});

	redirect(
		`/dashboard/stacks${stack.environment?.id ? `?environment=${encodeURIComponent(stack.environment.id)}` : ""}`,
	);
}

export async function createContainerAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const image = getValue(formData, "image");
	const environmentId = getValue(formData, "environmentId") || undefined;
	const memory = getValue(formData, "memory") || undefined;
	const cpus = getValue(formData, "cpus") || undefined;
	const restartPolicy = getValue(formData, "restartPolicy") || undefined;
	const network = getValue(formData, "network") || undefined;
	const command = getValue(formData, "command") || undefined;

	if (!name || !image) {
		throw new Error("Container name and image are required.");
	}

	const ports = parseJsonValue<Array<{ host: string; container: string }>>(formData, "ports") || [];
	const volumes =
		parseJsonValue<Array<{ host: string; container: string }>>(formData, "volumes") || [];
	const envVars = parseJsonValue<Array<{ key: string; value: string }>>(formData, "envVars") || [];

	const result = await createContainerForEnvironment(
		auth.userId,
		{
			name,
			image,
			memory,
			cpus,
			restartPolicy,
			ports,
			volumes,
			envVars,
			network,
			command,
		},
		environmentId,
	);

	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "container.create",
		status: result.ok ? "success" : "error",
		details: { containerName: name, image, output: result.ok ? null : result.output },
	});

	if (!result.ok) {
		throw new Error(result.output || "Failed to create container.");
	}

	revalidatePath("/dashboard/containers");
}

export async function controlContainerAction(formData: FormData) {
	const auth = await requireUserSession();
	const containerId = getValue(formData, "containerId");
	const action = getValue(formData, "action");
	const environmentId = getValue(formData, "environmentId") || undefined;
	const removeVolumes = getBoolValue(formData, "removeVolumes");

	if (!containerId || !["start", "stop", "restart", "remove"].includes(action)) {
		throw new Error("Container and action are required");
	}
	if (action === "remove") {
		requireDestructiveConfirmation(formData);
	}

	await requireAccessibleContainerForUser({
		containerId,
		userId: auth.userId,
		role: auth.role,
		environmentId,
	});
	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const containers =
		environment.kind === "local"
			? await listContainers()
			: await listAccessibleContainersForUser(auth.userId, auth.role, environment.id);
	const container = containers.find((entry: Record<string, string>) => entry.ID === containerId);

	if (environment.kind === "local" && container && isProtectedManagerContainer(container)) {
		throw new Error("Dockroot protected containers cannot be modified from the runtime dashboard.");
	}

	await controlContainerForEnvironment({
		userId: auth.userId,
		environmentId,
		containerId,
		action: action as "start" | "stop" | "restart" | "remove",
		removeVolumes,
		containerName: container?.Names || container?.Name || undefined,
	});
	revalidatePath("/dashboard/containers");
}

export async function bulkControlContainerAction(formData: FormData) {
	const auth = await requireUserSession();
	const containerIds = getValues(formData, "containerIds");
	const action = getValue(formData, "action");
	const environmentId = getValue(formData, "environmentId") || undefined;
	const removeVolumes = getBoolValue(formData, "removeVolumes");

	if (!containerIds.length || !["start", "stop", "restart", "remove"].includes(action)) {
		throw new Error("Containers and action are required");
	}
	if (action === "remove") {
		requireDestructiveConfirmation(formData);
	}

	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const containers =
		environment.kind === "local"
			? await listContainers()
			: await listAccessibleContainersForUser(auth.userId, auth.role, environment.id);
	const allowedIds = new Set(
		containers.map((entry: Record<string, string>) => entry.ID).filter(Boolean),
	);

	for (const containerId of Array.from(new Set(containerIds))) {
		if (!allowedIds.has(containerId)) {
			continue;
		}
		const container = containers.find((entry: Record<string, string>) => entry.ID === containerId);
		if (environment.kind === "local" && container && isProtectedManagerContainer(container)) {
			continue;
		}
		await controlContainerForEnvironment({
			userId: auth.userId,
			environmentId,
			containerId,
			action: action as "start" | "stop" | "restart" | "remove",
			removeVolumes,
			containerName: container?.Names || container?.Name || undefined,
		});
	}
	revalidatePath("/dashboard/containers");
}

export async function controlComposeProjectAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const projectName = getValue(formData, "projectName");
	const action = getValue(formData, "action");
	const removeVolumes = getBoolValue(formData, "removeVolumes");
	const removeImages = getBoolValue(formData, "removeImages");
	const configFiles = formData
		.getAll("configFiles")
		.map((value) => String(value).trim())
		.filter(Boolean);

	if (!projectName || !["start", "stop", "restart", "destroy"].includes(action)) {
		throw new Error("Compose project and action are required");
	}
	if (isProtectedManagerStack(projectName)) {
		throw new Error("Dockroot platform stacks are locked and cannot be controlled from the UI.");
	}
	if (action === "destroy") {
		requireDestructiveConfirmation(formData);
	}

	await controlComposeProject(
		projectName,
		configFiles,
		action as "start" | "stop" | "restart" | "destroy",
		{ removeVolumes, removeImages },
	);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		userId: auth.userId,
		actionType: `compose.${action}`,
		details: {
			projectName,
			configFiles,
			removeVolumes,
			removeImages,
		},
	});
	revalidatePath("/dashboard/stacks");
}

export async function pullImageAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const imageRef = getValue(formData, "imageRef");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!imageRef) {
		throw new Error("Image reference is required");
	}

	await pullImageForEnvironment(auth.userId, imageRef, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "image.pull",
		details: { imageRef },
	});
	revalidatePath("/dashboard/images");
}

export async function removeImageAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const imageRef = getValue(formData, "imageRef");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!imageRef) {
		throw new Error("Image reference is required");
	}

	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const containers =
		environment.kind === "local"
			? await listContainers()
			: (await listContainersForEnvironment(auth.userId, environment.id)).containers;

	if (environment.kind === "local" && isProtectedManagerImage(imageRef, containers)) {
		throw new Error("Dockroot protected images cannot be deleted from the runtime dashboard.");
	}
	const inUseBy = listContainersUsingImage(containers, imageRef);
	if (inUseBy.length) {
		throw new Error(
			`Cannot delete image ${imageRef}: it is in use by ${inUseBy.length} container(s): ${inUseBy.slice(0, 3).join(", ")}${inUseBy.length > 3 ? ", ..." : ""}.`,
		);
	}

	try {
		await removeImageForEnvironment(auth.userId, imageRef, environmentId);
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			environmentId,
			userId: auth.userId,
			actionType: "image.remove",
			details: { imageRef },
		});
	} catch (error) {
		throw normalizeInUseDeleteError("image", imageRef, error);
	}
	revalidatePath("/dashboard/images");
}

export async function bulkRemoveImagesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const imageRefs = getValues(formData, "imageRefs");
	const environmentId = getValue(formData, "environmentId") || undefined;
	if (!imageRefs.length) {
		throw new Error("At least one image is required.");
	}

	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const containers =
		environment.kind === "local"
			? await listContainers()
			: (await listContainersForEnvironment(auth.userId, environment.id)).containers;
	const inUseErrors: string[] = [];
	for (const imageRef of Array.from(new Set(imageRefs))) {
		if (environment.kind === "local" && isProtectedManagerImage(imageRef, containers)) {
			continue;
		}
		const inUseBy = listContainersUsingImage(containers, imageRef);
		if (inUseBy.length) {
			inUseErrors.push(
				`${imageRef} (used by ${inUseBy.slice(0, 2).join(", ")}${inUseBy.length > 2 ? ", ..." : ""})`,
			);
			continue;
		}
		try {
			await removeImageForEnvironment(auth.userId, imageRef, environmentId);
		} catch (error) {
			throw normalizeInUseDeleteError("image", imageRef, error);
		}
	}
	if (inUseErrors.length) {
		throw new Error(
			`Some images cannot be deleted because they are in use: ${inUseErrors.slice(0, 5).join("; ")}${inUseErrors.length > 5 ? "; ..." : ""}.`,
		);
	}
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "image.remove.bulk",
		details: { imageRefs: Array.from(new Set(imageRefs)) },
	});
	revalidatePath("/dashboard/images");
}

export async function pruneImagesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const mode = getValue(formData, "mode");
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneImagesForEnvironment(auth.userId, environmentId, { all: mode === "all" });
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "image.prune",
		details: { mode: mode || "dangling" },
	});
	revalidatePath("/dashboard/images");
}

export async function createVolumeAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const driver = getValue(formData, "driver") || "local";
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!name) {
		throw new Error("Volume name is required");
	}

	await createVolumeForEnvironment(auth.userId, name, driver, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.create",
		details: { volumeName: name, driver },
	});
	revalidatePath("/dashboard/volumes");
}

export async function removeVolumeAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!name) {
		throw new Error("Volume name is required");
	}

	try {
		await removeVolumeForEnvironment(auth.userId, name, environmentId);
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			environmentId,
			userId: auth.userId,
			actionType: "volume.remove",
			details: { volumeName: name },
		});
	} catch (error) {
		throw normalizeInUseDeleteError("volume", name, error);
	}
	revalidatePath("/dashboard/volumes");
}

export async function bulkRemoveVolumesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const names = getValues(formData, "names");
	const environmentId = getValue(formData, "environmentId") || undefined;
	if (!names.length) {
		throw new Error("At least one volume is required.");
	}

	for (const name of Array.from(new Set(names))) {
		try {
			await removeVolumeForEnvironment(auth.userId, name, environmentId);
		} catch (error) {
			throw normalizeInUseDeleteError("volume", name, error);
		}
	}
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.remove.bulk",
		details: { volumeNames: Array.from(new Set(names)) },
	});
	revalidatePath("/dashboard/volumes");
}

export async function pruneVolumesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneVolumesForEnvironment(auth.userId, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.prune",
	});
	revalidatePath("/dashboard/volumes");
}

export async function createNetworkAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const driver = getValue(formData, "driver") || "bridge";
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!name) {
		throw new Error("Network name is required");
	}

	await createNetworkForEnvironment(auth.userId, name, driver, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "network.create",
		details: { networkName: name, driver },
	});
	revalidatePath("/dashboard/networks");
}

export async function removeNetworkAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!name) {
		throw new Error("Network name is required");
	}

	try {
		await removeNetworkForEnvironment(auth.userId, name, environmentId);
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			environmentId,
			userId: auth.userId,
			actionType: "network.remove",
			details: { networkName: name },
		});
	} catch (error) {
		throw normalizeInUseDeleteError("network", name, error);
	}
	revalidatePath("/dashboard/networks");
}

export async function bulkRemoveNetworksAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const names = getValues(formData, "names");
	const environmentId = getValue(formData, "environmentId") || undefined;
	if (!names.length) {
		throw new Error("At least one network is required.");
	}

	for (const name of Array.from(new Set(names))) {
		try {
			await removeNetworkForEnvironment(auth.userId, name, environmentId);
		} catch (error) {
			throw normalizeInUseDeleteError("network", name, error);
		}
	}
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "network.remove.bulk",
		details: { networkNames: Array.from(new Set(names)) },
	});
	revalidatePath("/dashboard/networks");
}

export async function pruneNetworksAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneNetworksForEnvironment(auth.userId, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "network.prune",
	});
	revalidatePath("/dashboard/networks");
}

export async function updateGlobalSettingsAction(formData: FormData) {
	const { userId } = await requirePrivilegedSession();
	const managerUrl = getValue(formData, "managerUrl");

	await updateGlobalSettings({
		userId,
		managerUrl,
	});
}

export async function setContainerUpdatePolicyAction(formData: FormData) {
	const auth = await requireUserSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	const containerName = getValue(formData, "containerName");
	const mode = getValue(formData, "mode");
	const enabled = getBoolValue(formData, "enabled");

	if (!containerName || !["check", "update"].includes(mode)) {
		throw new Error("Container policy input is invalid.");
	}

	await setContainerUpdatePolicy({
		userId: auth.userId,
		environmentId,
		containerName,
		checkEnabled: mode === "check" ? enabled : undefined,
		updateEnabled: mode === "update" ? enabled : undefined,
	});

	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/schedules");
}

export async function checkContainerUpdatesAction(formData: FormData) {
	const auth = await requireUserSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	const containerId = getValue(formData, "containerId");

	if (!containerId) {
		throw new Error("Container is required.");
	}

	await requireAccessibleContainerForUser({
		containerId,
		userId: auth.userId,
		role: auth.role,
		environmentId,
	});
	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const sourceContainers =
		environment.kind === "local"
			? await listContainers()
			: await listAccessibleContainersForUser(auth.userId, auth.role, environment.id);
	const container = sourceContainers.find(
		(entry: Record<string, string>) => entry.ID === containerId,
	);
	if (!container) {
		throw new Error("Container not found.");
	}
	const schedule = await getOrCreateContainerUpdateSchedule(auth.userId, environment.id);

	await runContainerUpdateCheck({
		userId: auth.userId,
		environmentId: environment.id,
		containerNames: [container.Names || container.Name || ""],
		respectPolicies: false,
		pullBeforeCheck: schedule.pullBeforeCheck,
		includeMajorVersions: schedule.checkMode === "include_major",
	});

	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/schedules");
}

export async function bulkCheckContainerUpdatesAction(formData: FormData) {
	const auth = await requireUserSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	const containerIds = getValues(formData, "containerIds");

	if (!containerIds.length) {
		throw new Error("At least one container is required.");
	}

	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const sourceContainers =
		environment.kind === "local"
			? await listContainers()
			: await listAccessibleContainersForUser(auth.userId, auth.role, environment.id);
	const allowedIds = new Set(sourceContainers.map((entry: Record<string, string>) => entry.ID));
	const containerNames = Array.from(new Set(containerIds))
		.filter((containerId) => allowedIds.has(containerId))
		.map((containerId) => {
			const container = sourceContainers.find(
				(entry: Record<string, string>) => entry.ID === containerId,
			);
			return container?.Names || container?.Name || "";
		})
		.filter(Boolean);

	if (!containerNames.length) {
		throw new Error("No accessible containers selected.");
	}
	const schedule = await getOrCreateContainerUpdateSchedule(auth.userId, environment.id);

	await runContainerUpdateCheck({
		userId: auth.userId,
		environmentId: environment.id,
		containerNames,
		respectPolicies: false,
		pullBeforeCheck: schedule.pullBeforeCheck,
		includeMajorVersions: schedule.checkMode === "include_major",
	});

	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/schedules");
}

export async function applyContainerUpdatesAction(formData: FormData) {
	const auth = await requireUserSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	const containerId = getValue(formData, "containerId");

	if (!containerId) {
		throw new Error("Container is required.");
	}

	await requireAccessibleContainerForUser({
		containerId,
		userId: auth.userId,
		role: auth.role,
		environmentId,
	});
	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const sourceContainers =
		environment.kind === "local"
			? await listContainers()
			: await listAccessibleContainersForUser(auth.userId, auth.role, environment.id);
	const container = sourceContainers.find(
		(entry: Record<string, string>) => entry.ID === containerId,
	);
	if (!container) {
		throw new Error("Container not found.");
	}

	const result = await runContainerUpdateApply({
		userId: auth.userId,
		environmentId: environment.id,
		containerNames: [container.Names || container.Name || ""],
		respectPolicies: false,
		updateOnlyRunning: getBoolValue(formData, "updateOnlyRunning"),
	});
	if (result.queuedStackIds.length) {
		redirect(
			`/dashboard/containers?environment=${encodeURIComponent(environment.id)}&watchStackId=${encodeURIComponent(result.queuedStackIds[0])}`,
		);
	}

	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/stacks");
	revalidatePath("/dashboard/schedules");
}

export async function bulkApplyContainerUpdatesAction(formData: FormData) {
	const auth = await requireUserSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	const containerIds = getValues(formData, "containerIds");

	if (!containerIds.length) {
		throw new Error("At least one container is required.");
	}

	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const sourceContainers =
		environment.kind === "local"
			? await listContainers()
			: await listAccessibleContainersForUser(auth.userId, auth.role, environment.id);
	const allowedIds = new Set(sourceContainers.map((entry: Record<string, string>) => entry.ID));
	const containerNames = Array.from(new Set(containerIds))
		.filter((containerId) => allowedIds.has(containerId))
		.map((containerId) => {
			const container = sourceContainers.find(
				(entry: Record<string, string>) => entry.ID === containerId,
			);
			return container?.Names || container?.Name || "";
		})
		.filter(Boolean);

	if (!containerNames.length) {
		throw new Error("No accessible containers selected.");
	}

	const result = await runContainerUpdateApply({
		userId: auth.userId,
		environmentId: environment.id,
		containerNames,
		respectPolicies: false,
		updateOnlyRunning: getBoolValue(formData, "updateOnlyRunning"),
	});
	if (result.queuedStackIds.length) {
		redirect(
			`/dashboard/containers?environment=${encodeURIComponent(environment.id)}&watchStackId=${encodeURIComponent(result.queuedStackIds[0])}`,
		);
	}

	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/stacks");
	revalidatePath("/dashboard/schedules");
}

export async function runContainerUpdateCheckNowAction(formData: FormData) {
	const { userId } = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	const schedule = await getOrCreateContainerUpdateSchedule(userId, environmentId);
	await runContainerUpdateCheck({
		userId,
		environmentId,
		respectPolicies: true,
		pullBeforeCheck: schedule.pullBeforeCheck,
		includeMajorVersions: schedule.checkMode === "include_major",
	});
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/schedules");
}

export async function runContainerUpdateApplyNowAction(formData: FormData) {
	const { userId } = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	const result = await runContainerUpdateApply({
		userId,
		environmentId,
		respectPolicies: true,
		updateOnlyRunning: true,
	});
	if (result.queuedStackIds.length) {
		redirect(
			`/dashboard/stacks?environment=${encodeURIComponent(result.environment.id)}&watchStackId=${encodeURIComponent(result.queuedStackIds[0])}`,
		);
	}
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/stacks");
	revalidatePath("/dashboard/schedules");
}

// ---------------------------------------------------------------------------
// Volume backup / restore
// ---------------------------------------------------------------------------

export async function backupVolumeAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const volumeName = getValue(formData, "volumeName");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!volumeName) {
		throw new Error("Volume name is required.");
	}

	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const { randomUUID } = await import("node:crypto");
	const backupId = randomUUID();
	const createdAt = new Date();

	const { db: dbClient, volumeBackups } = await import("@dockroot/db");
	await dbClient.insert(volumeBackups).values({
		id: backupId,
		environmentId: environment.id,
		volumeName,
		fileName: `${backupId}.tar.gz`,
		status: "in_progress",
		createdByUserId: auth.userId,
		createdAt,
	});

	try {
		const { backupVolumeForEnvironment } = await import("@/lib/environment-runtime");
		const result = await backupVolumeForEnvironment(
			auth.userId,
			volumeName,
			backupId,
			environmentId,
		);
		if (!result.ok) {
			const { eq } = await import("drizzle-orm");
			await dbClient
				.update(volumeBackups)
				.set({
					status: "failed",
					error: result.output || "Backup failed.",
					completedAt: new Date(),
				})
				.where(eq(volumeBackups.id, backupId));
			throw new Error(`Backup failed: ${result.output}`);
		}

		const sizeBytes = result.sizeBytes;
		const { eq } = await import("drizzle-orm");
		await dbClient
			.update(volumeBackups)
			.set({ status: "completed", sizeBytes: sizeBytes ?? undefined, completedAt: new Date() })
			.where(eq(volumeBackups.id, backupId));
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			environmentId: environment.id,
			userId: auth.userId,
			actionType: "volume.backup.create",
			details: {
				volumeName,
				backupId,
				fileName: result.fileName,
				sizeBytes: sizeBytes ?? null,
			},
		});
	} catch (error) {
		const { eq } = await import("drizzle-orm");
		await dbClient
			.update(volumeBackups)
			.set({
				status: "failed",
				error: error instanceof Error ? error.message : "Backup failed.",
				completedAt: new Date(),
			})
			.where(eq(volumeBackups.id, backupId));
		throw error;
	}

	revalidatePath("/dashboard/volumes");
}

export async function restoreVolumeAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const backupId = getValue(formData, "backupId");
	const volumeName = getValue(formData, "volumeName");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!backupId || !volumeName) {
		throw new Error("Backup ID and volume name are required.");
	}

	const { restoreVolumeForEnvironment } = await import("@/lib/environment-runtime");
	const result = await restoreVolumeForEnvironment(
		auth.userId,
		volumeName,
		backupId,
		environmentId,
	);
	if (!result.ok) {
		throw new Error(`Restore failed: ${result.output}`);
	}
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.backup.restore",
		details: { volumeName, backupId },
	});

	revalidatePath("/dashboard/volumes");
}

export async function deleteVolumeBackupAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const backupId = getValue(formData, "backupId");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!backupId) {
		throw new Error("Backup ID is required.");
	}

	const { deleteVolumeBackupForEnvironment } = await import("@/lib/environment-runtime");
	await deleteVolumeBackupForEnvironment(auth.userId, backupId, environmentId);

	const { db: dbClient, volumeBackups } = await import("@dockroot/db");
	const { eq } = await import("drizzle-orm");
	await dbClient.delete(volumeBackups).where(eq(volumeBackups.id, backupId));
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.backup.delete",
		details: { backupId },
	});

	revalidatePath("/dashboard/volumes");
}

export async function listVolumeBackupsAction(volumeName: string, environmentId?: string) {
	const auth = await requireUserSession();
	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const { listVolumeBackupsForUser } = await import("@/lib/volume-backups");
	const grouped = await listVolumeBackupsForUser({
		userId: auth.userId,
		environmentId: environment.id,
		volumeNames: [volumeName],
	});

	return grouped[volumeName] || [];
}

export async function updateContainerUpdateScheduleAction(formData: FormData) {
	const { userId } = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId");
	if (!environmentId) {
		throw new Error("Environment is required.");
	}

	await updateContainerUpdateSchedule({
		userId,
		environmentId,
		checkMode: getValue(formData, "checkMode") === "include_major" ? "include_major" : "same_tag",
		autoCheckEnabled: getBoolValue(formData, "autoCheckEnabled"),
		autoUpdateEnabled: getBoolValue(formData, "autoUpdateEnabled"),
		checkIntervalMinutes: Number(getValue(formData, "checkIntervalMinutes") || "60"),
		updateIntervalMinutes: Number(getValue(formData, "updateIntervalMinutes") || "240"),
		pullBeforeCheck: getBoolValue(formData, "pullBeforeCheck"),
		updateOnlyRunning: getBoolValue(formData, "updateOnlyRunning"),
	});

	revalidatePath("/dashboard/schedules");
	redirect(`/dashboard/schedules?environment=${encodeURIComponent(environmentId)}`);
}

export async function deleteActivityEventsAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const idsRaw = getValue(formData, "eventIds");
	if (!idsRaw) throw new Error("No events specified.");
	const eventIds = idsRaw
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	if (!eventIds.length) throw new Error("No events specified.");

	const { deleteActivityEvents } = await import("@/lib/platform");
	const result = await deleteActivityEvents(userId, eventIds);
	revalidatePath("/dashboard/activity");
	return result;
}

export async function clearAllActivityEventsAction() {
	const { userId } = await requireUserSession();
	const { clearAllActivityEvents } = await import("@/lib/platform");
	const result = await clearAllActivityEvents(userId);
	revalidatePath("/dashboard/activity");
	return result;
}
