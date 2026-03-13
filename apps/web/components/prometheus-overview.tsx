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
		<div className="rounded-lg border border-default/10 bg-surface px-3 py-2 shadow-[var(--shadow-md)]">
			<p className="text-[11px] font-medium text-muted">{label}</p>
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
				title="Metrics unavailable"
				description="Start the monitoring stack to enable live telemetry."
				className="p-6"
			/>
		);
	}

	return (
		<div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
			<Panel padding="md">
				<h3 className="text-sm font-semibold">Host utilization</h3>
				<div className="mt-3 grid gap-4 xl:grid-cols-2">
					<div>
						<p className="text-xs font-medium text-muted">
							CPU {metrics.cpuPercent?.toFixed(1) ?? "—"}%
						</p>
						<ChartFrame className="mt-1.5 h-44">
							{({ width, height }) => (
								<AreaChart width={width} height={height} data={metrics.cpuSeries}>
									<defs>
										<linearGradient id="overview-cpu-fill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
											<stop offset="95%" stopColor="var(--accent)" stopOpacity={0.01} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
									<XAxis
										dataKey="time"
										tick={{ fontSize: 10, fill: "var(--muted)" }}
										axisLine={false}
										tickLine={false}
									/>
									<YAxis
										tick={{ fontSize: 10, fill: "var(--muted)" }}
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
										strokeWidth={1.5}
									/>
								</AreaChart>
							)}
						</ChartFrame>
					</div>
					<div>
						<p className="text-xs font-medium text-muted">
							Memory {metrics.memoryPercent?.toFixed(1) ?? "—"}%
						</p>
						<ChartFrame className="mt-1.5 h-44">
							{({ width, height }) => (
								<AreaChart width={width} height={height} data={metrics.memorySeries}>
									<defs>
										<linearGradient id="overview-memory-fill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="var(--success)" stopOpacity={0.2} />
											<stop offset="95%" stopColor="var(--success)" stopOpacity={0.01} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
									<XAxis
										dataKey="time"
										tick={{ fontSize: 10, fill: "var(--muted)" }}
										axisLine={false}
										tickLine={false}
									/>
									<YAxis
										tick={{ fontSize: 10, fill: "var(--muted)" }}
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
										strokeWidth={1.5}
									/>
								</AreaChart>
							)}
						</ChartFrame>
					</div>
				</div>
			</Panel>

			{/* Right column */}
			<div className="grid gap-4">
				<Panel padding="md">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold">Deployment status</h3>
						<span className="text-xs text-muted">{metrics.runningContainers ?? 0} running</span>
					</div>
					<ChartFrame className="mt-2 h-36">
						{({ width, height }) => (
							<PieChart width={width} height={height}>
								<Pie
									data={metrics.deploymentStatus}
									dataKey="value"
									nameKey="label"
									innerRadius={40}
									outerRadius={58}
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

				<Panel padding="md">
					<h3 className="text-sm font-semibold">Environment health</h3>
					<div className="mt-2 space-y-1">
						{metrics.environmentStatus.map((entry, index) => (
							<div
								key={entry.label}
								className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-foreground/[0.03]"
							>
								<div className="flex items-center gap-2">
									<span
										className="h-2 w-2 rounded-full"
										style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
									/>
									<span className="text-sm capitalize">{entry.label}</span>
								</div>
								<span className="tabular-nums text-muted">{entry.value}</span>
							</div>
						))}
					</div>
				</Panel>
			</div>
		</div>
	);
}
