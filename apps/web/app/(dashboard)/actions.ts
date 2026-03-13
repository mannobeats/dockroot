"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isPrivilegedRole, requirePrivilegedSession, requireUserSession } from "@/lib/authorization";
import {
	controlContainerForEnvironment,
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
	return getValue(formData, key) === "true";
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

function normalizeInUseDeleteError(resource: "image" | "volume" | "network", target: string, error: unknown) {
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
			return new Error(`Cannot delete volume ${target}: it is currently attached to one or more containers.`);
		}
	}
	if (resource === "network") {
		if (lower.includes("has active endpoints") || lower.includes("resource is in use")) {
			return new Error(`Cannot delete network ${target}: one or more containers are still connected to it.`);
		}
	}
	return error instanceof Error ? error : new Error(message || "Action failed.");
}

function getContainerDisplayName(container: Record<string, string>) {
	return container.Names || container.Name || container.ID?.slice(0, 12) || "container";
}

function listContainersUsingImage(containers: Record<string, string>[], imageRef: string) {
	return containers.filter((container) => (container.Image || "").trim() === imageRef).map(getContainerDisplayName);
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

	await createEnvironment({
		userId,
		name,
		description,
		agentUrl,
	});

	redirect("/dashboard/environments");
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

	redirect("/dashboard/environments");
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

	redirect("/dashboard/stacks");
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
		await controlComposeProject(project.projectName, project.configFiles?.filter(Boolean) || [], "restart");
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
		await controlComposeProject(project.projectName, project.configFiles?.filter(Boolean) || [], "stop");
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

	redirect("/dashboard/stacks");
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
	const allowedIds = new Set(containers.map((entry: Record<string, string>) => entry.ID).filter(Boolean));

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
		});
	}
	revalidatePath("/dashboard/containers");
}

export async function controlComposeProjectAction(formData: FormData) {
	await requirePrivilegedSession();
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
	revalidatePath("/dashboard/images");
}

export async function pruneImagesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const mode = getValue(formData, "mode");
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneImagesForEnvironment(auth.userId, environmentId, { all: mode === "all" });
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
	revalidatePath("/dashboard/volumes");
}

export async function pruneVolumesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneVolumesForEnvironment(auth.userId, environmentId);
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
	revalidatePath("/dashboard/networks");
}

export async function pruneNetworksAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneNetworksForEnvironment(auth.userId, environmentId);
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
