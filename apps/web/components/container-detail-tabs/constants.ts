import type { ContainerDetailTabId } from "./types";

export const CONTAINER_DETAIL_TABS: Array<{ id: ContainerDetailTabId; label: string }> = [
	{ id: "overview", label: "Overview" },
	{ id: "metrics", label: "Metrics" },
	{ id: "logs", label: "Logs" },
	{ id: "config", label: "Configuration" },
	{ id: "networks", label: "Networks" },
	{ id: "storage", label: "Storage" },
	{ id: "files", label: "Files" },
];
