"use server";

import { revalidatePath } from "next/cache";
import {
	getRequiredControllableStack,
	parseComposeControlInput,
	recordAuditEvent,
} from "@/app/(dashboard)/actions/stacks/shared";
import {
	getValue,
	requireDestructiveConfirmation,
} from "@/app/(dashboard)/actions/utils/form-data";
import { requirePrivilegedSession, requireUserSession } from "@/lib/authorization";
import { queueOrRunDeployment, updateStackConfig } from "@/lib/platform";
import { controlComposeProject } from "@/lib/platform/docker";
import { isProtectedManagerStack } from "@/lib/runtime-protection";

export async function deployStackAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const stackId = getValue(formData, "stackId");

	if (!stackId) {
		throw new Error("Stack is required");
	}

	await getRequiredControllableStack(
		stackId,
		userId,
		"Dockroot platform stacks are locked and cannot be controlled from the UI.",
	);

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

	await getRequiredControllableStack(
		stackId,
		userId,
		"Dockroot platform stacks are locked and cannot be edited from the UI.",
	);

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

	await getRequiredControllableStack(
		stackId,
		userId,
		"Dockroot platform stacks are locked and cannot be destroyed from the UI.",
	);

	await queueOrRunDeployment({
		stackId,
		userId,
		operation: "destroy",
	});
}

export async function controlComposeProjectAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const { action, configFiles, projectName, removeImages, removeVolumes } =
		parseComposeControlInput(formData);

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
