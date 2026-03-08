"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { io, type Socket } from "socket.io-client";
import { ChartFrame } from "@/components/chart-frame";

let socket: Socket | null = null;

function getSocket() {
	if (!socket) {
		socket = io({
			path: "/socket.io",
		});
	}

	return socket;
}

function parsePercent(value: string | undefined) {
	return Number.parseFloat((value || "0").replace("%", "")) || 0;
}

interface RuntimePayload {
	at: number;
	containers: Array<{
		Name?: string;
		CPUPerc?: string;
		MemPerc?: string;
	}>;
}

type ChartTooltipEntry = {
	name?: string;
	value?: number | string;
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
					{entry.name}: {entry.value}%
				</p>
			))}
		</div>
	);
};

export function LiveRuntimePanel() {
	const [mounted, setMounted] = useState(false);
	const [history, setHistory] = useState<Array<{ time: string; cpu: number; memory: number }>>([]);

	useEffect(() => {
		setMounted(true);
		const client = getSocket();

		const onMetrics = (payload: RuntimePayload) => {
			const cpu =
				payload.containers.reduce((sum, item) => sum + parsePercent(item.CPUPerc), 0) /
				Math.max(payload.containers.length, 1);
			const memory =
				payload.containers.reduce((sum, item) => sum + parsePercent(item.MemPerc), 0) /
				Math.max(payload.containers.length, 1);

			setHistory((current) => [
				...current.slice(-11),
				{
					time: new Date(payload.at).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
					cpu: Number(cpu.toFixed(1)),
					memory: Number(memory.toFixed(1)),
				},
			]);
		};

		client.on("runtime:metrics", onMetrics);

		return () => {
			client.off("runtime:metrics", onMetrics);
		};
	}, []);

	const latest = useMemo(() => history.at(-1), [history]);

	return (
		<div className="rounded-xl border border-default/10 bg-surface p-5">
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2">
						<h3 className="text-sm font-semibold">Live telemetry</h3>
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot" />
					</div>
					<p className="mt-0.5 text-xs text-muted">Real-time container resource usage</p>
				</div>
				<div className="flex items-center gap-4 text-xs">
					<span className="flex items-center gap-1.5">
						<span className="h-2 w-2 rounded-full bg-foreground" />
						CPU {latest?.cpu ?? 0}%
					</span>
					<span className="flex items-center gap-1.5">
						<span className="h-2 w-2 rounded-full bg-emerald-500" />
						MEM {latest?.memory ?? 0}%
					</span>
				</div>
			</div>
			<ChartFrame className="mt-4 h-56">
				{mounted
					? ({ width, height }) => (
							<BarChart width={width} height={height} data={history} barGap={2}>
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
									domain={[0, "auto"]}
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
									fill="#22c55e"
									radius={[3, 3, 0, 0]}
									maxBarSize={24}
								/>
							</BarChart>
						)
					: () => null}
			</ChartFrame>
		</div>
	);
}
