"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame } from "@/components/chart-frame";
import { Panel } from "@/components/ui/panel";
import { getSocket, subscribeMetrics, unsubscribeMetrics } from "@/lib/socket-client";

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
		source?: "native" | "docker";
		cpuPercent?: number | null;
		memoryPercent?: number | null;
	};
}

type HistoryEntry = { time: string; cpu: number; memory: number; source: "native" | "docker" };

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
		<div className="rounded-lg border border-default/10 bg-surface px-3 py-2 shadow-[var(--shadow-md)]">
			<p className="text-[11px] font-medium text-muted">{label}</p>
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

const MAX_HISTORY = 60;
const THROTTLE_MS = 1_000;

export function LiveRuntimePanel() {
	const [mounted, setMounted] = useState(false);
	const [history, setHistory] = useState<HistoryEntry[]>([]);
	const pendingRef = useRef<HistoryEntry | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastFlushRef = useRef(0);

	const flushPending = useCallback(() => {
		timerRef.current = null;
		if (pendingRef.current) {
			const entry = pendingRef.current;
			pendingRef.current = null;
			lastFlushRef.current = Date.now();
			setHistory((current) => [...current.slice(-(MAX_HISTORY - 1)), entry]);
		}
	}, []);

	useEffect(() => {
		setMounted(true);
		const client = getSocket();
		// This panel is currently intended for the shared local runtime stream.
		subscribeMetrics({ environmentId: "local", environmentKind: "local" });

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
			const source: "native" | "docker" = payload.host?.source === "native" ? "native" : "docker";

			const entry: HistoryEntry = {
				time: new Date(payload.at).toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				}),
				cpu: Number(cpu.toFixed(1)),
				memory: Number(memory.toFixed(1)),
				source,
			};

			pendingRef.current = entry;
			const elapsed = Date.now() - lastFlushRef.current;
			if (elapsed >= THROTTLE_MS) {
				flushPending();
			} else if (!timerRef.current) {
				timerRef.current = setTimeout(flushPending, THROTTLE_MS - elapsed);
			}
		};

		client.on("runtime:metrics", onMetrics);

		return () => {
			client.off("runtime:metrics", onMetrics);
			unsubscribeMetrics({ environmentId: "local", environmentKind: "local" });
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [flushPending]);

	const latest = useMemo(() => history.at(-1), [history]);

	return (
		<Panel padding="md">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h3 className="text-xs font-medium text-muted">Live telemetry</h3>
					<span className="relative flex h-1.5 w-1.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
						<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
					</span>
				</div>
				<div className="flex items-center gap-5">
					<div className="flex items-center gap-1.5">
						<span className="h-1.5 w-1.5 rounded-full bg-accent" />
						<span className="text-xs text-muted">CPU</span>
						<span className="font-mono text-xs font-medium tabular-nums">{latest?.cpu ?? 0}%</span>
					</div>
					<div className="flex items-center gap-1.5">
						<span className="h-1.5 w-1.5 rounded-full bg-success" />
						<span className="text-xs text-muted">Memory</span>
						<span className="font-mono text-xs font-medium tabular-nums">
							{latest?.memory ?? 0}%
						</span>
					</div>
				</div>
			</div>
			<ChartFrame className="mt-3 h-40">
				{mounted
					? ({ width, height }) => (
							<AreaChart width={width} height={height} data={history}>
								<defs>
									<linearGradient id="runtime-cpu-fill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="var(--accent)" stopOpacity={0.12} />
										<stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
									</linearGradient>
									<linearGradient id="runtime-memory-fill" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="var(--success)" stopOpacity={0.12} />
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
									domain={[0, "auto"]}
									tickFormatter={(v) => `${v}%`}
									width={36}
								/>
								<Tooltip content={<CustomTooltip />} />
								<Area
									type="monotone"
									dataKey="cpu"
									name="CPU"
									fill="url(#runtime-cpu-fill)"
									stroke="var(--accent)"
									strokeWidth={1.5}
								/>
								<Area
									type="monotone"
									dataKey="memory"
									name="Memory"
									fill="url(#runtime-memory-fill)"
									stroke="var(--success)"
									strokeWidth={1.5}
								/>
							</AreaChart>
						)
					: () => null}
			</ChartFrame>
		</Panel>
	);
}
