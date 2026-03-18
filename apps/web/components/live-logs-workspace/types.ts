export interface LogContainer {
	id: string;
	name: string;
	image: string;
	state: string;
}

export type LiveLogsMode = "single" | "grouped";

export interface LiveLogsWorkspaceProps {
	containers: LogContainer[];
	initialLogs: Record<string, string>;
	initialMode: LiveLogsMode;
	initialSelectedIds: string[];
	transport?: "local" | "remote";
	environmentId?: string;
}
