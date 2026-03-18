import type { StackContainer } from "@/components/stacks-table-workspace/types";

export function normalizeStatus(status: string) {
	return status.split("(")[0]?.trim().toLowerCase() || "unknown";
}

export function isRunningStack(status: string, runningCount: number) {
	return runningCount > 0 || normalizeStatus(status).includes("running");
}

export function getContainerName(container: StackContainer) {
	return container.Names || container.Name || container.ID?.slice(0, 12) || "container";
}

export function getContainerState(container: StackContainer) {
	return container.State || container.Status || "unknown";
}

export function getContainerImage(container: StackContainer) {
	return container.Image || "unknown image";
}
