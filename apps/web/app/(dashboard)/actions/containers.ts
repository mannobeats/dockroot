"use server";

import { revalidatePath } from "next/cache";
import {
	getBoolValue,
	getValue,
	getValues,
	parseJsonValue,
	requireDestructiveConfirmation,
} from "@/app/(dashboard)/actions/utils/form-data";
import { requirePrivilegedSession, requireUserSession } from "@/lib/authorization";
import {
	controlContainerForEnvironment,
	createContainerForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { listContainers } from "@/lib/platform/docker";
import {
	listAccessibleContainersForUser,
	requireAccessibleContainerForUser,
} from "@/lib/runtime-access";
import { isProtectedManagerContainer } from "@/lib/runtime-protection";

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
