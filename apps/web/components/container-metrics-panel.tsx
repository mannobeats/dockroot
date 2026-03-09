"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/chart-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { UtilizationBar } from "@/components/ui/utilization-bar";

function formatBytes(value: number | null) {
	if (value === null) {
		return "—";
	}

	const units = ["B", "KB", "MB", "GB"];
	let amount = value;
	let index = 0;

	while (amount >= 1024 && index < units.length - 1) {
		amount /= 1024;
		index += 1;
	}

	return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function safePercent(value: number | null) {
	return Math.max(0, Math.min(100, Number(value || 0)));
}

export function ContainerMetricsPanel({
	metrics,
}: {
	metrics: {
		available: boolean;
		cpuPercent: number | null;
		memoryBytes: number | null;
		rxBytes: number | null;
		txBytes: number | null;
		cpuSeries: Array<{ time: string; value: number }>;
		memorySeries: Array<{ time: string; value: number }>;
		rxSeries: Array<{ time: string; value: number }>;
		txSeries: Array<{ time: string; value: number }>;
	};
}) {
	if (!metrics.available) {
		return (
			<EmptyState
				title="Metrics unavailable"
				description="Prometheus container metrics are not available yet for this container."
				className="p-6"
			/>
		);
	}

	const maxMemorySample = metrics.memorySeries.reduce((max, point) => {
		return Math.max(max, point.value);
	}, metrics.memoryBytes || 0);

	return (
		<div className="space-y-5">
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<MetricCard label="CPU" value={`${metrics.cpuPercent?.toFixed(1) ?? "—"}%`} />
				<MetricCard label="Working set memory" value={formatBytes(metrics.memoryBytes)} />
				<MetricCard label="RX / sec" value={formatBytes(metrics.rxBytes)} />
				<MetricCard label="TX / sec" value={formatBytes(metrics.txBytes)} />
			</div>
			<Panel padding="md" className="space-y-4">
				<p className="text-sm font-semibold">Current utilization</p>
				<UtilizationBar
					label="CPU usage"
					valueLabel={`${metrics.cpuPercent?.toFixed(1) ?? "0.0"}%`}
					percent={safePercent(metrics.cpuPercent)}
					helper="Current usage against available CPU time"
				/>
				<UtilizationBar
					label="Memory usage"
					valueLabel={formatBytes(metrics.memoryBytes)}
					percent={safePercent(
						maxMemorySample > 0 ? ((metrics.memoryBytes || 0) / maxMemorySample) * 100 : 0,
					)}
					helper="Relative to recent peak working set memory"
				/>
			</Panel>

			<div className="grid gap-5 xl:grid-cols-2">
				<Panel padding="md">
					<p className="text-sm font-semibold">CPU and memory</p>
					<ChartFrame className="mt-4 h-64">
						{({ width, height }) => (
							<AreaChart
								width={width}
								height={height}
								data={metrics.cpuSeries.map((point, index) => ({
									time: point.time,
									cpu: point.value,
									memory: (metrics.memorySeries[index]?.value || 0) / 1024 / 1024,
								}))}
							>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
								<XAxis
									dataKey="time"
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
								/>
								<YAxis
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
								/>
								<Tooltip />
								<Area
									type="monotone"
									dataKey="cpu"
									stroke="var(--accent)"
									fill="var(--accent)"
									fillOpacity={0.15}
								/>
								<Area
									type="monotone"
									dataKey="memory"
									stroke="#10b981"
									fill="#10b981"
									fillOpacity={0.12}
								/>
							</AreaChart>
						)}
					</ChartFrame>
				</Panel>

				<Panel padding="md">
					<p className="text-sm font-semibold">Network throughput</p>
					<ChartFrame className="mt-4 h-64">
						{({ width, height }) => (
							<AreaChart
								width={width}
								height={height}
								data={metrics.rxSeries.map((point, index) => ({
									time: point.time,
									rx: point.value / 1024,
									tx: (metrics.txSeries[index]?.value || 0) / 1024,
								}))}
							>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
								<XAxis
									dataKey="time"
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
								/>
								<YAxis
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
								/>
								<Tooltip />
								<Area
									type="monotone"
									dataKey="rx"
									stroke="#0ea5e9"
									fill="#0ea5e9"
									fillOpacity={0.15}
								/>
								<Area
									type="monotone"
									dataKey="tx"
									stroke="#f59e0b"
									fill="#f59e0b"
									fillOpacity={0.12}
								/>
							</AreaChart>
						)}
					</ChartFrame>
				</Panel>
			</div>
		</div>
	);
}
