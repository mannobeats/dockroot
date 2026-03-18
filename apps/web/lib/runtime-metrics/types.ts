export type RuntimeStatsRow = Record<string, string>;
export type RuntimeContainerRow = Record<string, string>;

export type RuntimeSnapshotPayload = {
	host: {
		hostname?: string | null;
		totalMemoryGb?: number | null;
		freeMemoryGb?: number | null;
	};
	counts?: {
		containers?: number;
		runningContainers?: number;
		images?: number;
		volumes?: number;
		networks?: number;
	};
	usage?: {
		cpuPercent?: number | null;
		memoryPercent?: number | null;
	};
	containers?: RuntimeContainerRow[];
	containerStats?: RuntimeStatsRow[];
};

export type MetricsSeriesResult = {
	available: boolean;
	cpuPercent: number | null;
	memoryPercent: number | null;
	runningContainers: number | null;
	containerCount: number | null;
	imageCount: number | null;
	memoryUsedBytes: number | null;
	memoryTotalBytes: number | null;
	cpuSeries: Array<{ time: string; value: number }>;
	memorySeries: Array<{ time: string; value: number }>;
};
