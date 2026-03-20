"use server";

import { revalidatePath } from "next/cache";
import {
	assertBulkTargetsExist,
	assertPrivilegedForUntrackedProjects,
	getControllableStack,
	isManageableProject,
	parseBulkStackTargets,
	projectConfigFiles,
	recordAuditEvent,
} from "@/app/(dashboard)/actions/stacks/shared";
import {
	getBoolValue,
	getValue,
	requireDestructiveConfirmation,
} from "@/app/(dashboard)/actions/utils/form-data";
import { requirePrivilegedSession, requireUserSession } from "@/lib/authorization";
import { deleteStack, queueOrRunDeployment } from "@/lib/platform";
import { controlComposeProject } from "@/lib/platform/docker";

export async function bulkDeployStacksAction(formData: FormData) {
	const { userId, role } = await requireUserSession();
	const { stackIds } = parseBulkStackTargets(formData);
	if (!stackIds.length) {
		throw new Error("At least one stack is required.");
	}

	for (const stackId of stackIds) {
		const stack = await getControllableStack(stackId, userId, role);
		if (!stack) {
			continue;
		}
		await queueOrRunDeployment({
			stackId,
			userId,
			role,
			operation: "deploy",
		});
	}
	revalidatePath("/dashboard/stacks");
}

export async function bulkRestartStacksAction(formData: FormData) {
	const auth = await requireUserSession();
	const { projects, stackIds } = parseBulkStackTargets(formData);
	assertBulkTargetsExist(stackIds, projects);
	assertPrivilegedForUntrackedProjects(auth.role, projects.length);

	for (const stackId of stackIds) {
		const stack = await getControllableStack(stackId, auth.userId, auth.role);
		if (!stack) {
			continue;
		}
		await queueOrRunDeployment({
			stackId,
			userId: auth.userId,
			role: auth.role,
			operation: "deploy",
		});
	}

	for (const project of projects) {
		if (!isManageableProject(project.projectName)) {
			continue;
		}
		await controlComposeProject(project.projectName, projectConfigFiles(project), "restart");
	}

	revalidatePath("/dashboard/stacks");
}

export async function bulkStopStacksAction(formData: FormData) {
	const auth = await requireUserSession();
	const { projects, stackIds } = parseBulkStackTargets(formData);
	assertBulkTargetsExist(stackIds, projects);
	assertPrivilegedForUntrackedProjects(auth.role, projects.length);

	for (const stackId of stackIds) {
		const stack = await getControllableStack(stackId, auth.userId, auth.role);
		if (!stack) {
			continue;
		}
		await queueOrRunDeployment({
			stackId,
			userId: auth.userId,
			role: auth.role,
			operation: "destroy",
		});
	}

	for (const project of projects) {
		if (!isManageableProject(project.projectName)) {
			continue;
		}
		await controlComposeProject(project.projectName, projectConfigFiles(project), "stop");
	}

	revalidatePath("/dashboard/stacks");
}

export async function bulkDestroyStacksAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requireUserSession();
	const { projects, stackIds } = parseBulkStackTargets(formData);
	assertBulkTargetsExist(stackIds, projects);
	assertPrivilegedForUntrackedProjects(auth.role, projects.length);

	for (const stackId of stackIds) {
		const stack = await getControllableStack(stackId, auth.userId, auth.role);
		if (!stack) {
			continue;
		}
		await queueOrRunDeployment({
			stackId,
			userId: auth.userId,
			role: auth.role,
			operation: "destroy",
		});
	}

	for (const project of projects) {
		if (!isManageableProject(project.projectName)) {
			continue;
		}
		await controlComposeProject(project.projectName, projectConfigFiles(project), "destroy");
	}
	revalidatePath("/dashboard/stacks");
}

export async function bulkRemoveStacksAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requireUserSession();
	const { projects, stackIds } = parseBulkStackTargets(formData);
	assertBulkTargetsExist(stackIds, projects);
	assertPrivilegedForUntrackedProjects(auth.role, projects.length);

	for (const stackId of stackIds) {
		const stack = await getControllableStack(stackId, auth.userId, auth.role);
		if (!stack) {
			continue;
		}
		await deleteStack({
			stackId,
			userId: auth.userId,
			role: auth.role,
		});
		await recordAuditEvent({
			environmentId: stack.environment?.id,
			userId: auth.userId,
			actionType: "stack.delete",
			details: { stackName: stack.name, stackId },
		});
	}

	for (const project of projects) {
		if (!isManageableProject(project.projectName)) {
			continue;
		}
		const configFiles = projectConfigFiles(project);
		await controlComposeProject(project.projectName, configFiles, "destroy", {
			removeVolumes: true,
			removeImages: true,
		});
		await recordAuditEvent({
			userId: auth.userId,
			actionType: "compose.destroy",
			details: {
				projectName: project.projectName,
				configFiles,
				removeVolumes: true,
				removeImages: true,
			},
		});
	}

	revalidatePath("/dashboard/stacks");
}

export async function bulkControlComposeProjectsAction(formData: FormData) {
	await requirePrivilegedSession();
	const action = getValue(formData, "action");
	const removeVolumes = getBoolValue(formData, "removeVolumes");
	const removeImages = getBoolValue(formData, "removeImages");
	const { projects } = parseBulkStackTargets(formData);

	if (!projects.length || !["start", "stop", "restart", "destroy"].includes(action)) {
		throw new Error("Projects and action are required");
	}
	if (action === "destroy") {
		requireDestructiveConfirmation(formData);
	}

	for (const project of projects) {
		if (!isManageableProject(project.projectName)) {
			continue;
		}
		await controlComposeProject(
			project.projectName,
			projectConfigFiles(project),
			action as "start" | "stop" | "restart" | "destroy",
			{ removeVolumes, removeImages },
		);
	}
	revalidatePath("/dashboard/stacks");
}
