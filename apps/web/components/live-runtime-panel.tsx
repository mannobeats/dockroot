"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { io, type Socket } from "socket.io-client";
import { ChartFrame } from "@/components/chart-frame";
import { Panel } from "@/components/ui/panel";
import { UtilizationBar } from "@/components/ui/utilization-bar";

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
	host?: {
		source?: "prometheus";
		cpuPercent?: number | null;
		memoryPercent?: number | null;
	};
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
	const [history, setHistory] = useState<
		Array<{ time: string; cpu: number; memory: number; source: "prometheus" | "docker" }>
	>([]);

	useEffect(() => {
		setMounted(true);
		const client = getSocket();

		const onMetrics = (payload: RuntimePayload) => {
			const fallbackCpu =
				payload.containers.reduce((sum, item) => sum + parsePercent(item.CPUPerc), 0) /
				Math.max(payload.containers.length, 1);
			const fallbackMemory =
				payload.containers.reduce((sum, item) => sum + parsePercent(item.MemPerc), 0) /
				Math.max(payload.containers.length, 1);
			const hostCpu = payload.host?.cpuPercent;
			const hostMemory = payload.host?.memoryPercent;
			const cpu = Number.isFinite(hostCpu) ? Number(hostCpu) : fallbackCpu;
			const memory = Number.isFinite(hostMemory) ? Number(hostMemory) : fallbackMemory;
			const source: "prometheus" | "docker" =
				payload.host?.source === "prometheus" ? "prometheus" : "docker";

			setHistory((current) => [
				...current.slice(-11),
				{
					time: new Date(payload.at).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
					cpu: Number(cpu.toFixed(1)),
					memory: Number(memory.toFixed(1)),
					source,
				},
			]);
		};

		client.on("runtime:metrics", onMetrics);

		return () => {
			client.off("runtime:metrics", onMetrics);
		};
	}, []);

	const latest = useMemo(() => history.at(-1), [history]);
	const helperLabel =
		latest?.source === "prometheus"
			? "Host utilization from Prometheus"
			: "Average across running containers";

	return (
		<Panel padding="md">
			<div className="flex items-center justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						<h3 className="text-sm font-semibold">Live telemetry</h3>
						<span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
					</div>
					<p className="mt-0.5 text-xs text-muted">Real-time container resource usage</p>
				</div>
			</div>
			<div className="mt-4 grid gap-3 xl:grid-cols-2">
				<UtilizationBar
					label="CPU"
					valueLabel={`${latest?.cpu ?? 0}%`}
					percent={latest?.cpu ?? 0}
					helper={helperLabel}
				/>
				<UtilizationBar
					label="Memory"
					valueLabel={`${latest?.memory ?? 0}%`}
					percent={latest?.memory ?? 0}
					helper={
						latest?.source === "prometheus"
							? "Host memory pressure from Prometheus"
							: "Average usage against container limits"
					}
				/>
			</div>
			<ChartFrame className="mt-4 h-56">
				{mounted
					? ({ width, height }) => (
							<AreaChart width={width} height={height} data={history}>
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
								<Area
									type="monotone"
									dataKey="cpu"
									name="CPU"
									fill="var(--foreground)"
									fillOpacity={0.15}
									stroke="var(--foreground)"
									strokeWidth={2}
								/>
								<Area
									type="monotone"
									dataKey="memory"
									name="Memory"
									fill="var(--success)"
									fillOpacity={0.15}
									stroke="var(--success)"
									strokeWidth={2}
								/>
							</AreaChart>
						)
					: () => null}
			</ChartFrame>
		</Panel>
	);
}
