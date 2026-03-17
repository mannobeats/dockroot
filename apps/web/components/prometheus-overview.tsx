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

const STATUS_COLORS: Record<string, string> = {
	running: "#10b981",
	stopped: "#888888",
	error: "#ef4444",
	paused: "#f59e0b",
	healthy: "#10b981",
	degraded: "#f59e0b",
	down: "#ef4444",
	offline: "#9ca3af",
	provisioning: "#60a5fa",
	succeeded: "#10b981",
	failed: "#ef4444",
	queued: "#f59e0b",
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

const TimelineTooltip = ({ active, payload, label }: ChartTooltipProps) => {
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

function formatLabel(label: string) {
	return label.replaceAll("-", " ");
}

function DonutStatusCard({
	title,
	items,
	emptyLabel,
}: {
	title: string;
	items: Array<{ label: string; value: number }>;
	emptyLabel: string;
}) {
	const total = items.reduce((sum, item) => sum + item.value, 0);
	const activeItems = items.filter((item) => item.value > 0);

	return (
		<div className="rounded-2xl border border-default/10 bg-surface p-4">
			<div className="flex items-center justify-between gap-3">
				<p className="text-xs font-medium text-muted">{title}</p>
				<span className="text-xs tabular-nums text-muted">{total}</span>
			</div>
			{total > 0 ? (
				<>
					<ChartFrame className="mt-3 h-44">
						{({ width, height }) => (
							<PieChart width={width} height={height}>
								<Pie
									data={activeItems}
									dataKey="value"
									nameKey="label"
									cx="50%"
									cy="50%"
									innerRadius={44}
									outerRadius={66}
									paddingAngle={3}
									stroke="none"
								>
									{activeItems.map((entry) => (
										<Cell key={entry.label} fill={STATUS_COLORS[entry.label] || "#888888"} />
									))}
								</Pie>
								<text
									x={width / 2}
									y={height / 2 - 4}
									textAnchor="middle"
									className="fill-foreground text-[20px] font-semibold"
								>
									{total}
								</text>
								<text
									x={width / 2}
									y={height / 2 + 16}
									textAnchor="middle"
									className="fill-[var(--muted)] text-[10px]"
								>
									total
								</text>
							</PieChart>
						)}
					</ChartFrame>
					<div className="mt-2 space-y-2">
						{activeItems.map((entry) => (
							<div key={entry.label} className="flex items-center gap-2 text-xs">
								<span
									className="h-2 w-2 shrink-0 rounded-full"
									style={{ backgroundColor: STATUS_COLORS[entry.label] || "#888888" }}
								/>
								<span className="flex-1 capitalize text-muted">{formatLabel(entry.label)}</span>
								<span className="font-mono font-medium tabular-nums">{entry.value}</span>
							</div>
						))}
					</div>
				</>
			) : (
				<p className="mt-4 text-xs text-muted">{emptyLabel}</p>
			)}
		</div>
	);
}

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
		<div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
			<Panel padding="md" className="min-w-0">
				<div className="flex flex-col gap-3 border-b border-default/8 pb-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="min-w-0">
						<p className="text-xs font-medium text-muted">Operations Pulse</p>
						<h2 className="mt-1 text-xl font-semibold tracking-tight">
							Live infrastructure and deployment health
						</h2>
						<p className="mt-1 text-sm text-muted">
							Use trend lines for system pressure and the right rail for current state distribution.
						</p>
					</div>
					<div className="grid gap-2 sm:grid-cols-3">
						<div className="rounded-xl border border-default/10 bg-surface px-3 py-2.5">
							<p className="text-[11px] font-medium uppercase tracking-wide text-muted">CPU</p>
							<p className="mt-1 font-mono text-lg font-semibold tabular-nums">
								{metrics.cpuPercent?.toFixed(1) ?? "—"}%
							</p>
						</div>
						<div className="rounded-xl border border-default/10 bg-surface px-3 py-2.5">
							<p className="text-[11px] font-medium uppercase tracking-wide text-muted">Memory</p>
							<p className="mt-1 font-mono text-lg font-semibold tabular-nums">
								{metrics.memoryPercent?.toFixed(1) ?? "—"}%
							</p>
						</div>
						<div className="rounded-xl border border-default/10 bg-surface px-3 py-2.5">
							<p className="text-[11px] font-medium uppercase tracking-wide text-muted">
								Containers
							</p>
							<p className="mt-1 font-mono text-lg font-semibold tabular-nums">
								{metrics.runningContainers ?? 0}
							</p>
						</div>
					</div>
				</div>

				<div className="mt-4 grid gap-4 lg:grid-cols-2">
					<div className="min-w-0 rounded-2xl border border-default/10 bg-surface p-4">
						<div className="flex items-baseline justify-between gap-3">
							<p className="text-xs font-medium text-muted">CPU Trend</p>
							<span className="font-mono text-lg font-semibold tabular-nums">
								{metrics.cpuPercent?.toFixed(1) ?? "—"}
								<span className="text-xs font-normal text-muted">%</span>
							</span>
						</div>
						<ChartFrame className="mt-2 h-40">
							{({ width, height }) => (
								<AreaChart width={width} height={height} data={metrics.cpuSeries}>
									<defs>
										<linearGradient id="overview-cpu-fill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="var(--accent)" stopOpacity={0.18} />
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
									<Tooltip content={<TimelineTooltip />} />
									<Area
										type="monotone"
										dataKey="value"
										name="CPU"
										fill="url(#overview-cpu-fill)"
										stroke="var(--accent)"
										strokeWidth={1.6}
									/>
								</AreaChart>
							)}
						</ChartFrame>
					</div>

					<div className="min-w-0 rounded-2xl border border-default/10 bg-surface p-4">
						<div className="flex items-baseline justify-between gap-3">
							<p className="text-xs font-medium text-muted">Memory Trend</p>
							<span className="font-mono text-lg font-semibold tabular-nums">
								{metrics.memoryPercent?.toFixed(1) ?? "—"}
								<span className="text-xs font-normal text-muted">%</span>
							</span>
						</div>
						<ChartFrame className="mt-2 h-40">
							{({ width, height }) => (
								<AreaChart width={width} height={height} data={metrics.memorySeries}>
									<defs>
										<linearGradient id="overview-memory-fill" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="var(--success)" stopOpacity={0.18} />
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
									<Tooltip content={<TimelineTooltip />} />
									<Area
										type="monotone"
										dataKey="value"
										name="Memory"
										fill="url(#overview-memory-fill)"
										stroke="var(--success)"
										strokeWidth={1.6}
									/>
								</AreaChart>
							)}
						</ChartFrame>
					</div>
				</div>
			</Panel>

			<div className="grid gap-4">
				<DonutStatusCard
					title="Deployment Health"
					items={metrics.deploymentStatus}
					emptyLabel="No deployment data yet."
				/>
				<DonutStatusCard
					title="Environment Health"
					items={metrics.environmentStatus}
					emptyLabel="No environment health data yet."
				/>
			</div>
		</div>
	);
}
