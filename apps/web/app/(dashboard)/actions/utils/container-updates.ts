import { revalidatePath } from "next/cache";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";

export type RuntimeContainerEntry = Record<string, string>;

export async function loadAccessibleContainers(input: {
	userId: string;
	role: "member" | "owner" | "admin";
	environmentId?: string;
}) {
	const environment = await resolveRuntimeEnvironment(input.userId, input.environmentId);
	const sourceContainers = await listAccessibleContainersForUser(
		input.userId,
		input.role,
		environment.id,
	);

	return {
		environment,
		sourceContainers: sourceContainers as RuntimeContainerEntry[],
	};
}

export function extractContainerName(container: RuntimeContainerEntry | undefined) {
	return (container?.Names || container?.Name || "").trim();
}

export function findContainerById(containers: RuntimeContainerEntry[], containerId: string) {
	return containers.find((entry) => entry.ID === containerId);
}

export function getUniqueContainerNamesByIds(
	containers: RuntimeContainerEntry[],
	containerIds: string[],
) {
	const allowedIds = new Set(containers.map((entry) => entry.ID));
	return Array.from(new Set(containerIds))
		.filter((containerId) => allowedIds.has(containerId))
		.map((containerId) => extractContainerName(findContainerById(containers, containerId)))
		.filter(Boolean);
}

export function revalidateContainerUpdatePages() {
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/schedules");
}

export function revalidateContainerUpdateApplyPages() {
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/stacks");
	revalidatePath("/dashboard/schedules");
}
