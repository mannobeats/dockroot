export type MetricSeriesPoint = {
	time: string;
	value: number;
};

export type ContainerMetrics = {
	available: boolean;
	cpuPercent: number | null;
	memoryBytes: number | null;
	memoryLimitBytes: number | null;
	rxBytes: number | null;
	txBytes: number | null;
	cpuSeries: MetricSeriesPoint[];
	memorySeries: MetricSeriesPoint[];
	rxSeries: MetricSeriesPoint[];
	txSeries: MetricSeriesPoint[];
};
