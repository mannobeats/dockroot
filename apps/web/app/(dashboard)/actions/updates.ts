"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBoolValue, getValue, getValues } from "@/app/(dashboard)/actions/utils/form-data";
import { requirePrivilegedSession, requireUserSession } from "@/lib/authorization";
import {
	getOrCreateContainerUpdateSchedule,
	runContainerUpdateApply,
	runContainerUpdateCheck,
	setContainerUpdatePolicy,
	updateContainerUpdateSchedule,
} from "@/lib/container-updates";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";
import { listContainers } from "@/lib/platform/docker";
import {
	listAccessibleContainersForUser,
	requireAccessibleContainerForUser,
} from "@/lib/runtime-access";

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
