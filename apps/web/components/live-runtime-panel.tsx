"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
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
		<div className="rounded-2xl border border-default/15 bg-surface p-5">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
						Live telemetry
					</p>
					<h3 className="mt-2 text-lg font-semibold tracking-tight">Runtime activity</h3>
				</div>
				<div className="text-right">
					<p className="text-xs text-muted">Latest</p>
					<p className="text-sm font-semibold">
						CPU {latest?.cpu ?? 0}% • MEM {latest?.memory ?? 0}%
					</p>
				</div>
			</div>
			<ChartFrame className="mt-5 h-56">
				{mounted
					? ({ width, height }) => (
							<AreaChart width={width} height={height} data={history}>
								<defs>
									<linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
										<stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
									</linearGradient>
									<linearGradient id="memoryFill" x1="0" y1="0" x2="0" y2="1">
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
									fill="url(#cpuFill)"
									strokeWidth={2}
								/>
								<Area
									type="monotone"
									dataKey="memory"
									stroke="#10b981"
									fill="url(#memoryFill)"
									strokeWidth={2}
								/>
							</AreaChart>
						)
					: () => null}
			</ChartFrame>
		</div>
	);
}
