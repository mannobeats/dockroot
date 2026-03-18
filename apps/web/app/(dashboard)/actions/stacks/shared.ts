import {
	getBoolValue,
	getValue,
	getValues,
	parseJsonValue,
} from "@/app/(dashboard)/actions/utils/form-data";
import { isPrivilegedRole } from "@/lib/authorization";
import { getStackById } from "@/lib/platform";
import { isProtectedManagerStack } from "@/lib/runtime-protection";

export type BulkComposeProjectInput = {
	projectName: string;
	configFiles?: string[];
};

export function uniqueValues(values: string[]) {
	return Array.from(new Set(values));
}

export function parseBulkComposeProjects(formData: FormData): BulkComposeProjectInput[] {
	return (
		parseJsonValue<BulkComposeProjectInput[]>(formData, "projects")?.filter(
			(project) => project?.projectName,
		) || []
	);
}

export function parseBulkStackTargets(formData: FormData) {
	return {
		stackIds: uniqueValues(getValues(formData, "stackIds")),
		projects: parseBulkComposeProjects(formData),
	};
}

export function assertBulkTargetsExist(stackIds: string[], projects: BulkComposeProjectInput[]) {
	if (!stackIds.length && !projects.length) {
		throw new Error("Select at least one stack.");
	}
}

export function assertPrivilegedForUntrackedProjects(
	role: "owner" | "admin" | "member",
	projectCount: number,
) {
	if (projectCount && !isPrivilegedRole(role)) {
		throw new Error("Only owners/admins can control untracked compose stacks.");
	}
}

export function isManageableProject(projectName: string) {
	return !isProtectedManagerStack(projectName);
}

export function projectConfigFiles(project: BulkComposeProjectInput) {
	return project.configFiles?.filter(Boolean) || [];
}

export async function getControllableStack(stackId: string, userId: string) {
	const stack = await getStackById({ stackId, userId });
	if (!stack || isProtectedManagerStack(stack.slug)) {
		return null;
	}
	return stack;
}

export async function getRequiredControllableStack(
	stackId: string,
	userId: string,
	protectedMessage: string,
) {
	const stack = await getStackById({ stackId, userId });
	if (!stack) {
		throw new Error("Stack not found");
	}
	if (isProtectedManagerStack(stack.slug)) {
		throw new Error(protectedMessage);
	}
	return stack;
}

export async function recordAuditEvent(input: {
	environmentId?: string | null;
	userId: string;
	actionType: string;
	status?: "success" | "error";
	details?: Record<string, unknown>;
}) {
	const { recordAuditEvent: writeAuditEvent } = await import("@/lib/platform");
	await writeAuditEvent({
		environmentId: input.environmentId || undefined,
		userId: input.userId,
		actionType: input.actionType,
		status: input.status,
		details: input.details,
	});
}

export function parseComposeControlInput(formData: FormData) {
	return {
		projectName: getValue(formData, "projectName"),
		action: getValue(formData, "action"),
		removeVolumes: getBoolValue(formData, "removeVolumes"),
		removeImages: getBoolValue(formData, "removeImages"),
		configFiles: formData
			.getAll("configFiles")
			.map((value) => String(value).trim())
			.filter(Boolean),
	};
}

export function parseAdoptComposeInput(formData: FormData) {
	return {
		projectName: getValue(formData, "projectName"),
		configFiles: formData
			.getAll("configFiles")
			.map((value) => String(value).trim())
			.filter(Boolean),
	};
}
