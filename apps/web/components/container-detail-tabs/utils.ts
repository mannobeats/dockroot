import { CONTAINER_DETAIL_TABS } from "./constants";
import type { ContainerDetailTabId } from "./types";

export function safeContainerDetailTab(value: string | undefined): ContainerDetailTabId {
	return CONTAINER_DETAIL_TABS.find((tab) => tab.id === value)?.id || "overview";
}

export function summarizeLogs(input: string) {
	const lines = input.split("\n").filter(Boolean);
	return lines.slice(Math.max(0, lines.length - 120)).join("\n");
}
