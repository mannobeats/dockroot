"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/chart-frame";
import { Panel } from "@/components/ui/panel";
import type { ContainerMetrics } from "./types";

type TrendPanelProps = {
	title: string;
	gradientId: string;
	strokeColor: string;
	stopColor: string;
	data: Array<{ time: string; value: number }>;
	valueKey: string;
	yTickFormatter: (value: number) => string;
	tooltipFormatter: (value: number) => string;
};

function TrendPanel({
	title,
	gradientId,
	strokeColor,
	stopColor,
	data,
	valueKey,
	yTickFormatter,
	tooltipFormatter,
}: TrendPanelProps) {
	return (
		<Panel padding="md">
			<p className="text-sm font-semibold">{title}</p>
			<ChartFrame className="mt-4 h-64">
				{({ width, height }) => (
					<AreaChart width={width} height={height} data={data}>
						<defs>
							<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor={stopColor} stopOpacity={0.4} />
								<stop offset="95%" stopColor={stopColor} stopOpacity={0.05} />
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
							tickFormatter={(value) => yTickFormatter(Number(value))}
						/>
						<Tooltip
							formatter={(value) => [tooltipFormatter(Number(value)), title.split(" ")[0]]}
						/>
						<Area
							type="monotone"
							dataKey={valueKey}
							stroke={strokeColor}
							fill={`url(#${gradientId})`}
							strokeWidth={2}
						/>
					</AreaChart>
				)}
			</ChartFrame>
		</Panel>
	);
}

export function ContainerMetricsTrendChartsSection({ metrics }: { metrics: ContainerMetrics }) {
	const cpuData = useMemo(
		() => metrics.cpuSeries.map((point) => ({ time: point.time, value: point.value })),
		[metrics.cpuSeries],
	);

	const memoryData = useMemo(
		() =>
			metrics.memorySeries.map((point) => ({ time: point.time, value: point.value / 1024 / 1024 })),
		[metrics.memorySeries],
	);

	const rxData = useMemo(
		() => metrics.rxSeries.map((point) => ({ time: point.time, value: point.value / 1024 })),
		[metrics.rxSeries],
	);

	const txData = useMemo(
		() => metrics.txSeries.map((point) => ({ time: point.time, value: point.value / 1024 })),
		[metrics.txSeries],
	);

	return (
		<div className="grid gap-5 xl:grid-cols-2">
			<TrendPanel
				title="CPU usage trend"
				gradientId="container-cpu-fill"
				strokeColor="var(--foreground)"
				stopColor="var(--foreground)"
				data={cpuData}
				valueKey="value"
				yTickFormatter={(value) => `${value.toFixed(1)}%`}
				tooltipFormatter={(value) => `${value.toFixed(2)}%`}
			/>
			<TrendPanel
				title="Memory usage trend"
				gradientId="container-memory-fill"
				strokeColor="var(--success)"
				stopColor="var(--success)"
				data={memoryData}
				valueKey="value"
				yTickFormatter={(value) => `${value.toFixed(0)} MB`}
				tooltipFormatter={(value) => `${value.toFixed(1)} MB`}
			/>
			<TrendPanel
				title="Network receive trend"
				gradientId="container-rx-fill"
				strokeColor="#0ea5e9"
				stopColor="#0ea5e9"
				data={rxData}
				valueKey="value"
				yTickFormatter={(value) => `${value.toFixed(0)} KB/s`}
				tooltipFormatter={(value) => `${value.toFixed(1)} KB/s`}
			/>
			<TrendPanel
				title="Network transmit trend"
				gradientId="container-tx-fill"
				strokeColor="#f59e0b"
				stopColor="#f59e0b"
				data={txData}
				valueKey="value"
				yTickFormatter={(value) => `${value.toFixed(0)} KB/s`}
				tooltipFormatter={(value) => `${value.toFixed(1)} KB/s`}
			/>
		</div>
	);
}
