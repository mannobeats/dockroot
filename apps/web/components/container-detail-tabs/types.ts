export type ContainerDetailTabId =
	| "overview"
	| "metrics"
	| "logs"
	| "config"
	| "networks"
	| "storage"
	| "files";

export type ContainerMetrics = {
	available: boolean;
	cpuPercent: number | null;
	memoryBytes: number | null;
	memoryLimitBytes: number | null;
	rxBytes: number | null;
	txBytes: number | null;
	cpuSeries: Array<{ time: string; value: number }>;
	memorySeries: Array<{ time: string; value: number }>;
	rxSeries: Array<{ time: string; value: number }>;
	txSeries: Array<{ time: string; value: number }>;
};

export type ContainerBrowserState =
	| {
			kind: "directory";
			path: string;
			entries: Array<{ name: string; kind: "dir" | "file" | "other" }>;
	  }
	| { kind: "file"; path: string; content: string }
	| { kind: "missing"; path: string };

export interface ContainerDetailTabsProps {
	containerId: string;
	environmentId: string;
	inspect: Record<string, unknown>;
	details: Record<string, unknown> | null;
	metrics: ContainerMetrics | null;
	mounts: Array<{ Source?: string; Destination?: string; Type?: string; RW?: boolean }>;
	envVars: string[];
	labels: Record<string, string>;
	networkEntries: Array<[string, { IPAddress?: string; Gateway?: string }]>;
	publishedPortSummary: string;
	managerUrl?: string | null;
	canOpenRuntimeTopology: boolean;
	browser: ContainerBrowserState;
	targetPath: string;
	initialTab?: string;
}
