"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivilegedSession, requireUserSession } from "@/lib/authorization";
import {
	adoptComposeProject,
	createEnvironment,
	createGitHubStack,
	createProject,
	createStack,
	queueOrRunDeployment,
} from "@/lib/platform";
import {
	controlComposeProject,
	controlContainer,
	createNetwork,
	createVolume,
	listContainers,
	pruneImages,
	pruneNetworks,
	pruneVolumes,
	pullImage,
	removeImage,
	removeNetwork,
	removeVolume,
} from "@/lib/platform/docker";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";
import { isProtectedManagerContainer, isProtectedManagerImage } from "@/lib/runtime-protection";

function getValue(formData: FormData, key: string) {
	return String(formData.get(key) || "").trim();
}

export async function createProjectAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const name = getValue(formData, "name");
	const description = getValue(formData, "description");

	if (!name) {
		throw new Error("Project name is required");
	}

	await createProject({
		userId,
		name,
		description,
	});

	redirect("/dashboard/projects");
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

	revalidatePath("/dashboard/projects");
	revalidatePath("/dashboard/stacks");
	redirect(`/dashboard/stacks?adopted=${stackId}`);
}

export async function createEnvironmentAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const name = getValue(formData, "name");
	const description = getValue(formData, "description");
	const managerUrl = getValue(formData, "managerUrl");

	if (!name) {
		throw new Error("Environment name is required");
	}

	await createEnvironment({
		userId,
		name,
		description,
		managerUrl,
	});

	redirect("/dashboard/environments");
}

export async function createStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const projectId = getValue(formData, "projectId");
	const environmentId = getValue(formData, "environmentId");
	const name = getValue(formData, "name");
	const description = getValue(formData, "description");
	const composeYaml = getValue(formData, "composeYaml");
	const envFileContent = getValue(formData, "envFileContent");

	if (!projectId || !environmentId || !name || !composeYaml) {
		throw new Error("Project, environment, stack name, and compose YAML are required");
	}

	await createStack({
		userId,
		projectId,
		environmentId,
		name,
		description,
		composeYaml,
		envFileContent,
	});

	redirect(`/dashboard/projects/${projectId}`);
}

export async function createGitHubStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const projectId = getValue(formData, "projectId");
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

	if (
		!projectId ||
		!environmentId ||
		!installationId ||
		!owner ||
		!repository ||
		!branch ||
		!composePath
	) {
		throw new Error(
			"Project, environment, installation, repository, branch, and compose path are required",
		);
	}

	await createGitHubStack({
		userId,
		projectId,
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

	redirect(`/dashboard/projects/${projectId}`);
}

export async function deployStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const stackId = getValue(formData, "stackId");

	if (!stackId) {
		throw new Error("Stack is required");
	}

	await queueOrRunDeployment({
		stackId,
		userId,
		operation: "deploy",
	});
}

export async function destroyStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const stackId = getValue(formData, "stackId");

	if (!stackId) {
		throw new Error("Stack is required");
	}

	await queueOrRunDeployment({
		stackId,
		userId,
		operation: "destroy",
	});
}

export async function controlContainerAction(formData: FormData) {
	const auth = await requireUserSession();
	const containerId = getValue(formData, "containerId");
	const action = getValue(formData, "action");

	if (!containerId || !["start", "stop", "restart", "remove"].includes(action)) {
		throw new Error("Container and action are required");
	}

	await requireAccessibleContainerForUser({
		containerId,
		userId: auth.userId,
		role: auth.role,
	});
	const containers = await listContainers();
	const container = containers.find((entry) => entry.ID === containerId);

	if (container && isProtectedManagerContainer(container)) {
		throw new Error("Dockroot protected containers cannot be modified from the runtime dashboard.");
	}

	await controlContainer(containerId, action as "start" | "stop" | "restart" | "remove");
	revalidatePath("/dashboard/containers");
}

export async function controlComposeProjectAction(formData: FormData) {
	await requirePrivilegedSession();
	const projectName = getValue(formData, "projectName");
	const action = getValue(formData, "action");
	const configFiles = formData
		.getAll("configFiles")
		.map((value) => String(value).trim())
		.filter(Boolean);

	if (!projectName || !["start", "stop", "restart", "destroy"].includes(action)) {
		throw new Error("Compose project and action are required");
	}

	await controlComposeProject(
		projectName,
		configFiles,
		action as "start" | "stop" | "restart" | "destroy",
	);
	revalidatePath("/dashboard/stacks");
}

export async function pullImageAction(formData: FormData) {
	await requirePrivilegedSession();
	const imageRef = getValue(formData, "imageRef");

	if (!imageRef) {
		throw new Error("Image reference is required");
	}

	await pullImage(imageRef);
	revalidatePath("/dashboard/images");
}

export async function removeImageAction(formData: FormData) {
	await requirePrivilegedSession();
	const imageRef = getValue(formData, "imageRef");

	if (!imageRef) {
		throw new Error("Image reference is required");
	}

	const containers = await listContainers();

	if (isProtectedManagerImage(imageRef, containers)) {
		throw new Error("Dockroot protected images cannot be deleted from the runtime dashboard.");
	}

	await removeImage(imageRef);
	revalidatePath("/dashboard/images");
}

export async function pruneImagesAction(formData: FormData) {
	await requirePrivilegedSession();
	const mode = getValue(formData, "mode");
	await pruneImages({ all: mode === "all" });
	revalidatePath("/dashboard/images");
}

export async function createVolumeAction(formData: FormData) {
	await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const driver = getValue(formData, "driver") || "local";

	if (!name) {
		throw new Error("Volume name is required");
	}

	await createVolume(name, driver);
	revalidatePath("/dashboard/volumes");
}

export async function removeVolumeAction(formData: FormData) {
	await requirePrivilegedSession();
	const name = getValue(formData, "name");

	if (!name) {
		throw new Error("Volume name is required");
	}

	await removeVolume(name);
	revalidatePath("/dashboard/volumes");
}

export async function pruneVolumesAction() {
	await requirePrivilegedSession();
	await pruneVolumes();
	revalidatePath("/dashboard/volumes");
}

export async function createNetworkAction(formData: FormData) {
	await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const driver = getValue(formData, "driver") || "bridge";

	if (!name) {
		throw new Error("Network name is required");
	}

	await createNetwork(name, driver);
	revalidatePath("/dashboard/networks");
}

export async function removeNetworkAction(formData: FormData) {
	await requirePrivilegedSession();
	const name = getValue(formData, "name");

	if (!name) {
		throw new Error("Network name is required");
	}

	await removeNetwork(name);
	revalidatePath("/dashboard/networks");
}

export async function pruneNetworksAction() {
	await requirePrivilegedSession();
	await pruneNetworks();
	revalidatePath("/dashboard/networks");
}
