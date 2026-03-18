"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
	getBoolValue,
	getValue,
	getValues,
	parseJsonValue,
	requireDestructiveConfirmation,
} from "@/app/(dashboard)/actions/utils/form-data";
import {
	isPrivilegedRole,
	requirePrivilegedSession,
	requireUserSession,
} from "@/lib/authorization";
import {
	adoptComposeProject,
	createGitHubStack,
	createStack,
	deleteStack,
	getStackById,
	queueOrRunDeployment,
	updateStackConfig,
} from "@/lib/platform";
import { controlComposeProject } from "@/lib/platform/docker";
import { isProtectedManagerStack } from "@/lib/runtime-protection";

type BulkComposeProjectInput = {
	projectName: string;
	configFiles?: string[];
};

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
