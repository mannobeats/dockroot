"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { getSocket, subscribeMetrics, unsubscribeMetrics } from "@/lib/socket-client";

interface RuntimePayload {
	at: number;
	environmentId?: string;
	host?: {
		cpuPercent?: number | null;
		memoryPercent?: number | null;
	};
}

/**
 * Live infrastructure metrics panel.
 * Subscribes to environment-level runtime metrics via Socket.IO
 * and shows CPU/Memory as utilization bars with numeric values.
 * Works for both local and remote/agent environments.
 */
export function LiveInfrastructureMetrics({
	environmentId = "local",
	environmentKind = "local",
	initialCpu,
	initialMemory,
}: {
	environmentId?: string;
	environmentKind?: "local" | "agent";
	initialCpu?: number | null;
	initialMemory?: number | null;
}) {
	const [cpu, setCpu] = useState(initialCpu ?? null);
	const [memory, setMemory] = useState(initialMemory ?? null);
	const [lastUpdate, setLastUpdate] = useState<number | null>(null);
	const tickCountRef = useRef(0);

	const onMetrics = useCallback((payload: RuntimePayload) => {
		const cpuVal = payload.host?.cpuPercent ?? null;
		const memVal = payload.host?.memoryPercent ?? null;
		if (cpuVal !== null) setCpu(Number(cpuVal.toFixed(1)));
		if (memVal !== null) setMemory(Number(memVal.toFixed(1)));
		setLastUpdate(payload.at || Date.now());
		tickCountRef.current += 1;
	}, []);

	useEffect(() => {
		// Reset state when environment changes
		setCpu(initialCpu ?? null);
		setMemory(initialMemory ?? null);
		setLastUpdate(null);
		tickCountRef.current = 0;

		const client = getSocket();
		subscribeMetrics({ environmentId, environmentKind });
		client.on("runtime:metrics", onMetrics);

		return () => {
			client.off("runtime:metrics", onMetrics);
			unsubscribeMetrics({ environmentId, environmentKind });
		};
	}, [onMetrics, environmentId, environmentKind, initialCpu, initialMemory]);

	const isLive = lastUpdate !== null;
	const cpuColor = (cpu ?? 0) > 80 ? "bg-danger" : (cpu ?? 0) > 50 ? "bg-warning" : "bg-accent";
	const memColor =
		(memory ?? 0) > 85 ? "bg-danger" : (memory ?? 0) > 60 ? "bg-warning" : "bg-success";

	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<Panel padding="md" className="space-y-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<p className="text-xs font-medium text-muted">CPU</p>
							{isLive ? (
								<span className="relative flex h-1.5 w-1.5">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
									<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
								</span>
							) : null}
						</div>
						<span className="font-mono text-xl font-semibold tabular-nums">
							{cpu?.toFixed(1) ?? "—"}
							<span className="text-sm font-normal text-muted">%</span>
						</span>
					</div>
					<div className="h-2 overflow-hidden rounded-full bg-default/10">
						<div
							className={`h-full rounded-full transition-all duration-700 ease-out ${cpuColor}`}
							style={{ width: `${Math.min(cpu ?? 0, 100)}%` }}
						/>
					</div>
				</Panel>

				<Panel padding="md" className="space-y-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<p className="text-xs font-medium text-muted">Memory</p>
							{isLive ? (
								<span className="relative flex h-1.5 w-1.5">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
									<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
								</span>
							) : null}
						</div>
						<span className="font-mono text-xl font-semibold tabular-nums">
							{memory?.toFixed(1) ?? "—"}
							<span className="text-sm font-normal text-muted">%</span>
						</span>
					</div>
					<div className="h-2 overflow-hidden rounded-full bg-default/10">
						<div
							className={`h-full rounded-full transition-all duration-700 ease-out ${memColor}`}
							style={{ width: `${Math.min(memory ?? 0, 100)}%` }}
						/>
					</div>
				</Panel>
			</div>
		</div>
	);
}
