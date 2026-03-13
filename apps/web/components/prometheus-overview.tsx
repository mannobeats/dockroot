"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/chart-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";

const STATUS_COLORS: Record<string, string> = {
	running: "#10b981",
	stopped: "#888888",
	error: "#ef4444",
	paused: "#f59e0b",
	healthy: "#10b981",
	degraded: "#f59e0b",
	down: "#ef4444",
};

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

	const deploymentTotal = metrics.deploymentStatus.reduce((sum, d) => sum + d.value, 0);

	return (
		<div className="space-y-4">
			{/* CPU & Memory charts side by side */}
			<div className="grid gap-4 xl:grid-cols-2">
				<Panel padding="md">
					<div className="flex items-baseline justify-between">
						<p className="text-xs font-medium text-muted">CPU</p>
						<span className="font-mono text-lg font-semibold tabular-nums">
							{metrics.cpuPercent?.toFixed(1) ?? "—"}
							<span className="text-xs font-normal text-muted">%</span>
						</span>
					</div>
					<ChartFrame className="mt-2 h-36">
						{({ width, height }) => (
							<AreaChart width={width} height={height} data={metrics.cpuSeries}>
								<defs>
									<linearGradient id="overview-cpu-fill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="var(--accent)" stopOpacity={0.15} />
										<stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid stroke="var(--border)" vertical={false} />
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
									width={36}
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
				</Panel>

				<Panel padding="md">
					<div className="flex items-baseline justify-between">
						<p className="text-xs font-medium text-muted">Memory</p>
						<span className="font-mono text-lg font-semibold tabular-nums">
							{metrics.memoryPercent?.toFixed(1) ?? "—"}
							<span className="text-xs font-normal text-muted">%</span>
						</span>
					</div>
					<ChartFrame className="mt-2 h-36">
						{({ width, height }) => (
							<AreaChart width={width} height={height} data={metrics.memorySeries}>
								<defs>
									<linearGradient id="overview-memory-fill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="var(--success)" stopOpacity={0.15} />
										<stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid stroke="var(--border)" vertical={false} />
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
									width={36}
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
				</Panel>
			</div>

			{/* Deployment + Environment status - compact horizontal bars */}
			<div className="grid gap-4 xl:grid-cols-2">
				<Panel padding="md">
					<div className="flex items-center justify-between">
						<p className="text-xs font-medium text-muted">Deployments</p>
						<span className="text-xs tabular-nums text-muted">
							{metrics.runningContainers ?? 0} running
						</span>
					</div>
					{deploymentTotal > 0 ? (
						<>
							<div className="mt-3 flex h-2 overflow-hidden rounded-full bg-foreground/[0.04]">
								{metrics.deploymentStatus.map((entry) => {
									const pct = (entry.value / deploymentTotal) * 100;
									if (pct === 0) return null;
									return (
										<div
											key={entry.label}
											className="h-full transition-[width] duration-500"
											style={{
												width: `${pct}%`,
												backgroundColor: STATUS_COLORS[entry.label] || "#888",
											}}
										/>
									);
								})}
							</div>
							<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
								{metrics.deploymentStatus.map((entry) => (
									<div key={entry.label} className="flex items-center gap-1.5 text-xs">
										<span
											className="h-1.5 w-1.5 rounded-full"
											style={{ backgroundColor: STATUS_COLORS[entry.label] || "#888" }}
										/>
										<span className="capitalize text-muted">{entry.label}</span>
										<span className="tabular-nums font-medium">{entry.value}</span>
									</div>
								))}
							</div>
						</>
					) : (
						<p className="mt-3 text-xs text-muted">No deployment data</p>
					)}
				</Panel>

				<Panel padding="md">
					<p className="text-xs font-medium text-muted">Environments</p>
					<div className="mt-3 space-y-2">
						{metrics.environmentStatus.map((entry) => (
							<div key={entry.label} className="flex items-center gap-3">
								<span
									className="h-1.5 w-1.5 shrink-0 rounded-full"
									style={{ backgroundColor: STATUS_COLORS[entry.label] || "#888" }}
								/>
								<span className="flex-1 text-sm capitalize">{entry.label}</span>
								<span className="font-mono text-sm tabular-nums text-muted">{entry.value}</span>
							</div>
						))}
					</div>
				</Panel>
			</div>
		</div>
	);
}
