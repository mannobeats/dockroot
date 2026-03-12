"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivilegedSession, requireUserSession } from "@/lib/authorization";
import {
	controlContainerForEnvironment,
	createNetworkForEnvironment,
	createVolumeForEnvironment,
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

function requireDestructiveConfirmation(formData: FormData) {
	if (getValue(formData, "__confirmDestructive") !== "yes") {
		throw new Error("Confirmation is required for destructive actions.");
	}
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
	const containers = environment.kind === "local" ? await listContainers() : [];

	if (environment.kind === "local" && isProtectedManagerImage(imageRef, containers)) {
		throw new Error("Dockroot protected images cannot be deleted from the runtime dashboard.");
	}

	await removeImageForEnvironment(auth.userId, imageRef, environmentId);
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

	await removeVolumeForEnvironment(auth.userId, name, environmentId);
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

	await removeNetworkForEnvironment(auth.userId, name, environmentId);
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
