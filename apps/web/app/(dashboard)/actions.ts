"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
	createEnvironment,
	createProject,
	createStack,
	queueOrRunDeployment,
} from "@/lib/platform";
import { controlContainer } from "@/lib/platform/docker";
import { getServerSession } from "@/lib/session";

async function requireUserId() {
	const session = await getServerSession();

	if (!session?.user.id) {
		throw new Error("Unauthorized");
	}

	return session.user.id;
}

function getValue(formData: FormData, key: string) {
	return String(formData.get(key) || "").trim();
}

export async function createProjectAction(formData: FormData) {
	const userId = await requireUserId();
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

export async function createEnvironmentAction(formData: FormData) {
	const userId = await requireUserId();
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
	const userId = await requireUserId();
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

export async function deployStackAction(formData: FormData) {
	const userId = await requireUserId();
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
	const userId = await requireUserId();
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
	await requireUserId();
	const containerId = getValue(formData, "containerId");
	const action = getValue(formData, "action");

	if (!containerId || !["start", "stop", "restart"].includes(action)) {
		throw new Error("Container and action are required");
	}

	await controlContainer(containerId, action as "start" | "stop" | "restart");
	revalidatePath("/dashboard/containers");
}
