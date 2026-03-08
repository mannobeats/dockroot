"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/chart-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";

const PIE_COLORS = ["#22c55e", "#3b82f6", "#eab308", "#ef4444", "#a855f7"];

type ChartTooltipEntry = {
	name?: string;
	value?: number;
	color?: string;
};

type ChartTooltipProps = {
	active?: boolean;
	payload?: ChartTooltipEntry[];
	label?: string;
};

const CustomTooltip = ({ active, payload, label }: ChartTooltipProps) => {
	if (!active || !payload?.length) return null;
	return (
		<div className="rounded-lg border border-default/10 bg-surface px-3 py-2 shadow-lg">
			<p className="text-xs font-medium text-muted">{label}</p>
			{payload.map((entry, index) => (
				<p
					key={`${entry.name}-${index}`}
					className="text-sm font-semibold"
					style={{ color: entry.color }}
				>
					{entry.name}: {entry.value?.toFixed(1)}%
				</p>
			))}
		</div>
	);
};

export function PrometheusOverview({
	metrics,
}: {
	metrics: {
		available: boolean;
		cpuPercent: number | null;
		memoryPercent: number | null;
		runningContainers: number | null;
		deploymentStatus: Array<{ label: string; value: number }>;
		environmentStatus: Array<{ label: string; value: number }>;
		cpuSeries: Array<{ time: string; value: number }>;
		memorySeries: Array<{ time: string; value: number }>;
	};
}) {
	if (!metrics.available) {
		return (
			<EmptyState title="Prometheus data unavailable" description="Start the monitoring stack and the dashboard will switch to scraped metrics automatically." className="p-8" />
		);
	}

	const barData = metrics.cpuSeries.map((point, index) => ({
		time: point.time,
		cpu: point.value,
		memory: metrics.memorySeries[index]?.value ?? 0,
	}));

	return (
		<div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
			{/* Host Utilization — Bar Chart */}
			<Panel padding="md">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-sm font-semibold">Host utilization</h3>
						<p className="mt-0.5 text-xs text-muted">CPU & memory over time</p>
					</div>
					<div className="flex items-center gap-4 text-xs">
						<span className="flex items-center gap-1.5">
							<span className="h-2 w-2 rounded-full bg-foreground" />
							CPU {metrics.cpuPercent?.toFixed(1) ?? "—"}%
						</span>
						<span className="flex items-center gap-1.5">
							<span className="h-2 w-2 rounded-full bg-success" />
							MEM {metrics.memoryPercent?.toFixed(1) ?? "—"}%
						</span>
					</div>
				</div>
				<ChartFrame className="mt-4 h-64">
					{({ width, height }) => (
						<BarChart width={width} height={height} data={barData} barGap={2}>
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
								domain={[0, 100]}
								tickFormatter={(v) => `${v}%`}
							/>
							<Tooltip content={<CustomTooltip />} />
							<Bar
								dataKey="cpu"
								name="CPU"
								fill="var(--foreground)"
								radius={[3, 3, 0, 0]}
								maxBarSize={24}
							/>
							<Bar
								dataKey="memory"
								name="Memory"
									fill="var(--success)"
								radius={[3, 3, 0, 0]}
								maxBarSize={24}
							/>
						</BarChart>
						)}
					</ChartFrame>
				</Panel>

			{/* Right column: Pie + Environment Health */}
			<div className="grid gap-4">
				{/* Deployment Mix — Donut */}
				<Panel padding="md">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold">Deployment status</h3>
						<p className="text-xs text-muted">{metrics.runningContainers ?? 0} running</p>
					</div>
					<ChartFrame className="mt-3 h-44">
						{({ width, height }) => (
							<PieChart width={width} height={height}>
								<Pie
									data={metrics.deploymentStatus}
									dataKey="value"
									nameKey="label"
									innerRadius={48}
									outerRadius={70}
									paddingAngle={3}
									strokeWidth={0}
								>
									{metrics.deploymentStatus.map((entry, index) => (
										<Cell
											key={`${entry.label}-${index}`}
											fill={PIE_COLORS[index % PIE_COLORS.length]}
										/>
									))}
								</Pie>
								<Tooltip />
							</PieChart>
						)}
					</ChartFrame>
				</Panel>

				{/* Environment Health */}
				<Panel padding="md">
					<h3 className="text-sm font-semibold">Environment health</h3>
					<div className="mt-3 space-y-2">
						{metrics.environmentStatus.map((entry, index) => (
							<div
								key={entry.label}
								className="flex items-center justify-between rounded-lg bg-foreground/[0.02] px-3 py-2.5"
							>
								<div className="flex items-center gap-2.5">
									<span
										className="h-2 w-2 rounded-full"
										style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
									/>
									<p className="text-sm font-medium capitalize">{entry.label}</p>
								</div>
								<p className="text-sm tabular-nums text-muted">{entry.value}</p>
							</div>
						))}
					</div>
				</Panel>
			</div>
		</div>
	);
}
