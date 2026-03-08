"use client";

import {
	Area,
	AreaChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#a855f7"];

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
			<div className="rounded-2xl border border-dashed border-default/20 bg-surface p-6 text-sm text-muted">
				Prometheus data is not available yet. Start the monitoring stack and the dashboard will
				switch to scraped metrics automatically.
			</div>
		);
	}

	return (
		<div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
			<div className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
							Prometheus
						</p>
						<h3 className="mt-2 text-lg font-semibold tracking-tight">Host utilization</h3>
					</div>
					<p className="text-sm text-muted">
						CPU {metrics.cpuPercent?.toFixed(1) ?? "—"}% • MEM{" "}
						{metrics.memoryPercent?.toFixed(1) ?? "—"}%
					</p>
				</div>
				<div className="mt-5 h-64">
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart
							data={metrics.cpuSeries.map((point, index) => ({
								time: point.time,
								cpu: point.value,
								memory: metrics.memorySeries[index]?.value ?? 0,
							}))}
						>
							<defs>
								<linearGradient id="promCpu" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
									<stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
								</linearGradient>
								<linearGradient id="promMem" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
									<stop offset="100%" stopColor="#10b981" stopOpacity={0} />
								</linearGradient>
							</defs>
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
								fill="url(#promCpu)"
								strokeWidth={2}
							/>
							<Area
								type="monotone"
								dataKey="memory"
								stroke="#10b981"
								fill="url(#promMem)"
								strokeWidth={2}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className="grid gap-5">
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
								Deployment mix
							</p>
							<h3 className="mt-2 text-lg font-semibold tracking-tight">Status breakdown</h3>
						</div>
						<p className="text-sm text-muted">
							{metrics.runningContainers ?? 0} running containers
						</p>
					</div>
					<div className="mt-4 h-52">
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie
									data={metrics.deploymentStatus}
									dataKey="value"
									nameKey="label"
									innerRadius={52}
									outerRadius={78}
									paddingAngle={4}
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
						</ResponsiveContainer>
					</div>
				</div>
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
						Environment health
					</p>
					<div className="mt-4 grid gap-3">
						{metrics.environmentStatus.map((entry, index) => (
							<div
								key={entry.label}
								className="flex items-center justify-between rounded-xl bg-background/60 px-4 py-3"
							>
								<div className="flex items-center gap-3">
									<div
										className="h-3 w-3 rounded-full"
										style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
									/>
									<p className="text-sm font-medium capitalize">{entry.label}</p>
								</div>
								<p className="text-sm text-muted">{entry.value}</p>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
