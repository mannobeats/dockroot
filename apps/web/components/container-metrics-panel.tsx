"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/chart-frame";

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
			<div className="rounded-xl border border-dashed border-default/10 bg-surface p-6 text-sm text-muted">
				Prometheus container metrics are not available yet for this container.
			</div>
		);
	}

	return (
		<div className="space-y-5">
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">CPU</p>
					<p className="mt-2 text-2xl font-semibold">{metrics.cpuPercent?.toFixed(1) ?? "—"}%</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Working set memory</p>
					<p className="mt-2 text-2xl font-semibold">{formatBytes(metrics.memoryBytes)}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">RX / sec</p>
					<p className="mt-2 text-2xl font-semibold">{formatBytes(metrics.rxBytes)}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">TX / sec</p>
					<p className="mt-2 text-2xl font-semibold">{formatBytes(metrics.txBytes)}</p>
				</div>
			</div>

			<div className="grid gap-5 xl:grid-cols-2">
				<div className="rounded-xl border border-default/10 bg-surface p-5">
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
				</div>

				<div className="rounded-xl border border-default/10 bg-surface p-5">
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
				</div>
			</div>
		</div>
	);
}
