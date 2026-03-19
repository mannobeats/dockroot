"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContainerStats, RuntimePayload } from "@/components/containers-table-workspace/types";
import { getSocket, subscribeMetrics, unsubscribeMetrics } from "@/lib/socket-client";

const THROTTLE_MS = 1_000;

export function useRuntimeMetrics(input: {
	environmentId: string;
	environmentKind: "local" | "agent";
	initialWatchStackId?: string;
}) {
	const [containerStats, setContainerStats] = useState<Record<string, ContainerStats>>({});
	const [watchStackId, setWatchStackId] = useState(input.initialWatchStackId || "");
	const [logDockOpen, setLogDockOpen] = useState(Boolean(input.initialWatchStackId));

	const pendingRef = useRef<Record<string, ContainerStats> | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastFlushRef = useRef(0);

	const flushPending = useCallback(() => {
		timerRef.current = null;
		if (pendingRef.current) {
			setContainerStats(pendingRef.current);
			pendingRef.current = null;
			lastFlushRef.current = Date.now();
		}
	}, []);

	useEffect(() => {
		const client = getSocket();
		subscribeMetrics();

		const onMetrics = (payload: RuntimePayload) => {
			if (payload.environmentId) {
				const isMatch =
					(input.environmentKind === "local" && payload.environmentId === "local") ||
					payload.environmentId === input.environmentId;
				if (!isMatch) return;
			}

			const next: Record<string, ContainerStats> = {};
			for (const container of payload.containers) {
				if (container.Name) {
					const name = container.Name.replace(/^\//, "");
					next[name] = {
						CPUPerc: container.CPUPerc,
						MemPerc: container.MemPerc,
						MemUsage: container.MemUsage,
						NetIO: container.NetIO,
						BlockIO: container.BlockIO,
						PIDs: container.PIDs,
					};
				}
			}

			pendingRef.current = next;

			const elapsed = Date.now() - lastFlushRef.current;
			if (elapsed >= THROTTLE_MS) {
				flushPending();
			} else if (!timerRef.current) {
				timerRef.current = setTimeout(flushPending, THROTTLE_MS - elapsed);
			}
		};

		const onDeploymentUpdate = (event: { stackId?: string; status?: string }) => {
			if (!event?.stackId) return;
			if (event.status === "running" || event.status === "queued") {
				setWatchStackId(event.stackId);
				setLogDockOpen(true);
			}
		};

		client.on("runtime:metrics", onMetrics);
		client.on("deployment:update", onDeploymentUpdate);
		return () => {
			client.off("runtime:metrics", onMetrics);
			client.off("deployment:update", onDeploymentUpdate);
			unsubscribeMetrics();
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [input.environmentId, input.environmentKind, flushPending]);

	return {
		containerStats,
		watchStackId,
		setWatchStackId,
		logDockOpen,
		setLogDockOpen,
	};
}
