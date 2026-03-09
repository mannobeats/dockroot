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
		memoryLimitBytes: number | null;
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
				description="Container metrics are not available yet for this container."
				className="p-6"
			/>
		);
	}

	const maxMemorySample = metrics.memorySeries.reduce((max, point) => {
		return Math.max(max, point.value);
	}, metrics.memoryBytes || 0);
	const hasReliableLimit =
		Number.isFinite(metrics.memoryLimitBytes) &&
		(metrics.memoryLimitBytes || 0) > 0 &&
		(metrics.memoryLimitBytes || 0) < 9_000_000_000_000_000;
	const memoryUtilizationPercent = hasReliableLimit
		? ((metrics.memoryBytes || 0) / (metrics.memoryLimitBytes || 1)) * 100
		: maxMemorySample > 0
			? ((metrics.memoryBytes || 0) / maxMemorySample) * 100
			: 0;

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
					percent={safePercent(memoryUtilizationPercent)}
					helper={
						hasReliableLimit
							? `Usage against memory limit (${formatBytes(metrics.memoryLimitBytes)})`
							: "Relative to recent peak working set memory"
					}
				/>
			</Panel>

			<div className="grid gap-5 xl:grid-cols-2">
				<Panel padding="md">
					<p className="text-sm font-semibold">CPU usage trend</p>
					<ChartFrame className="mt-4 h-64">
						{({ width, height }) => (
							<AreaChart
								width={width}
								height={height}
								data={metrics.cpuSeries.map((point) => ({
									time: point.time,
									cpu: point.value,
								}))}
							>
								<defs>
									<linearGradient id="container-cpu-fill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="var(--foreground)" stopOpacity={0.35} />
										<stop offset="95%" stopColor="var(--foreground)" stopOpacity={0.05} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
								<XAxis
									dataKey="time"
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
									tickFormatter={(value) => `${value.toFixed(1)}%`}
								/>
								<Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, "CPU"]} />
								<Area
									type="monotone"
									dataKey="cpu"
									stroke="var(--foreground)"
									fill="url(#container-cpu-fill)"
									strokeWidth={2}
								/>
							</AreaChart>
						)}
					</ChartFrame>
				</Panel>

				<Panel padding="md">
					<p className="text-sm font-semibold">Memory usage trend</p>
					<ChartFrame className="mt-4 h-64">
						{({ width, height }) => (
							<AreaChart
								width={width}
								height={height}
								data={metrics.memorySeries.map((point) => ({
									time: point.time,
									memoryMb: point.value / 1024 / 1024,
								}))}
							>
								<defs>
									<linearGradient id="container-memory-fill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="var(--success)" stopOpacity={0.4} />
										<stop offset="95%" stopColor="var(--success)" stopOpacity={0.05} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
								<XAxis
									dataKey="time"
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
									tickFormatter={(value) => `${value.toFixed(0)} MB`}
								/>
								<Tooltip formatter={(value) => [`${Number(value).toFixed(1)} MB`, "Memory"]} />
								<Area
									type="monotone"
									dataKey="memoryMb"
									stroke="var(--success)"
									fill="url(#container-memory-fill)"
									strokeWidth={2}
								/>
							</AreaChart>
						)}
					</ChartFrame>
				</Panel>

				<Panel padding="md">
					<p className="text-sm font-semibold">Network receive trend</p>
					<ChartFrame className="mt-4 h-64">
						{({ width, height }) => (
							<AreaChart
								width={width}
								height={height}
								data={metrics.rxSeries.map((point) => ({
									time: point.time,
									rxKb: point.value / 1024,
								}))}
							>
								<defs>
									<linearGradient id="container-rx-fill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
										<stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
								<XAxis
									dataKey="time"
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
									tickFormatter={(value) => `${value.toFixed(0)} KB/s`}
								/>
								<Tooltip formatter={(value) => [`${Number(value).toFixed(1)} KB/s`, "RX"]} />
								<Area
									type="monotone"
									dataKey="rxKb"
									stroke="#0ea5e9"
									fill="url(#container-rx-fill)"
									strokeWidth={2}
								/>
							</AreaChart>
						)}
					</ChartFrame>
				</Panel>

				<Panel padding="md">
					<p className="text-sm font-semibold">Network transmit trend</p>
					<ChartFrame className="mt-4 h-64">
						{({ width, height }) => (
							<AreaChart
								width={width}
								height={height}
								data={metrics.txSeries.map((point) => ({
									time: point.time,
									txKb: point.value / 1024,
								}))}
							>
								<defs>
									<linearGradient id="container-tx-fill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
										<stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
								<XAxis
									dataKey="time"
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									tick={{ fontSize: 11, fill: "var(--muted)" }}
									axisLine={false}
									tickLine={false}
									tickFormatter={(value) => `${value.toFixed(0)} KB/s`}
								/>
								<Tooltip formatter={(value) => [`${Number(value).toFixed(1)} KB/s`, "TX"]} />
								<Area
									type="monotone"
									dataKey="txKb"
									stroke="#f59e0b"
									fill="url(#container-tx-fill)"
									strokeWidth={2}
								/>
							</AreaChart>
						)}
					</ChartFrame>
				</Panel>
			</div>
		</div>
	);
}
