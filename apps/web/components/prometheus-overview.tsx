"use client";

import {
	Area,
	AreaChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { ChartFrame } from "@/components/chart-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

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
		<div className="rounded-xl border border-default/10 bg-surface px-3.5 py-2.5 shadow-[var(--shadow-md)]">
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
			<EmptyState
				title="Metrics data unavailable"
				description="Start the monitoring stack and the dashboard will switch to live telemetry automatically."
				className="p-8"
			/>
		);
	}

	return (
		<div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
			{/* Host Utilization — Area Charts */}
			<Panel padding="lg">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-sm font-semibold tracking-tight">Host utilization</h3>
						<p className="mt-0.5 text-xs text-muted">CPU & memory over time</p>
					</div>
				</div>
				<div className="mt-5 grid gap-5 xl:grid-cols-2">
					<div>
						<p className="text-xs font-medium text-muted">
							CPU {metrics.cpuPercent?.toFixed(1) ?? "—"}%
						</p>
						<ChartFrame className="mt-2 h-56">
							{({ width, height }) => (
								<AreaChart width={width} height={height} data={metrics.cpuSeries}>
									<defs>
										<linearGradient id="overview-cpu-fill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
											<stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
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
										domain={[0, 100]}
										tickFormatter={(value) => `${value}%`}
									/>
									<Tooltip content={<CustomTooltip />} />
									<Area
										type="monotone"
										dataKey="value"
										name="CPU"
										fill="url(#overview-cpu-fill)"
										stroke="var(--accent)"
										strokeWidth={2}
									/>
								</AreaChart>
							)}
						</ChartFrame>
					</div>
					<div>
						<p className="text-xs font-medium text-muted">
							Memory {metrics.memoryPercent?.toFixed(1) ?? "—"}%
						</p>
						<ChartFrame className="mt-2 h-56">
							{({ width, height }) => (
								<AreaChart width={width} height={height} data={metrics.memorySeries}>
									<defs>
										<linearGradient id="overview-memory-fill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="var(--success)" stopOpacity={0.25} />
											<stop offset="95%" stopColor="var(--success)" stopOpacity={0.02} />
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
										domain={[0, 100]}
										tickFormatter={(value) => `${value}%`}
									/>
									<Tooltip content={<CustomTooltip />} />
									<Area
										type="monotone"
										dataKey="value"
										name="Memory"
										fill="url(#overview-memory-fill)"
										stroke="var(--success)"
										strokeWidth={2}
									/>
								</AreaChart>
							)}
						</ChartFrame>
					</div>
				</div>
			</Panel>

			{/* Right column: Pie + Environment Health */}
			<div className="grid gap-5">
				{/* Deployment Mix — Donut */}
				<Panel padding="lg">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold tracking-tight">Deployment status</h3>
						<p className="text-xs text-muted">{metrics.runningContainers ?? 0} running</p>
					</div>
					<ChartFrame className="mt-4 h-44">
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
				<Panel padding="lg">
					<h3 className="text-sm font-semibold tracking-tight">Environment health</h3>
					<div className="mt-4 space-y-2">
						{metrics.environmentStatus.map((entry, index) => (
							<div
								key={entry.label}
								className="flex items-center justify-between rounded-xl bg-foreground/[0.02] px-4 py-3 transition-colors hover:bg-foreground/[0.04]"
							>
								<div className="flex items-center gap-2.5">
									<span
										className="h-2.5 w-2.5 rounded-full"
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
