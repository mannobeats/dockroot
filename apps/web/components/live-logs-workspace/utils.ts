import type { LiveLogsMode, LogContainer } from "./types";

export function filterContainers(containers: LogContainer[], query: string) {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return containers;
	}

	return containers.filter((container) =>
		`${container.name} ${container.image} ${container.state}`
			.toLowerCase()
			.includes(normalizedQuery),
	);
}

export function buildCombinedLogs({
	selectedIds,
	containers,
	logsByContainer,
	mode,
}: {
	selectedIds: string[];
	containers: LogContainer[];
	logsByContainer: Record<string, string>;
	mode: LiveLogsMode;
}) {
	return selectedIds
		.map((containerId) => {
			const container = containers.find((item) => item.id === containerId);
			const content = logsByContainer[containerId] || "";
			if (mode === "single") {
				return content;
			}

			return content
				.split("\n")
				.filter(Boolean)
				.map((line) => `[${container?.name || containerId}] ${line}`)
				.join("\n");
		})
		.join("\n");
}
