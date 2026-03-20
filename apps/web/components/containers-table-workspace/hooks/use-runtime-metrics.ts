"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContainerStats, RuntimePayload } from "@/components/containers-table-workspace/types";
import { getSocket, subscribeMetrics, unsubscribeMetrics } from "@/lib/socket-client";

const THROTTLE_MS = 1_000;

function toRowStats(container: RuntimePayload["containers"][number]): ContainerStats {
	return {
		CPUPerc: container.CPUPerc,
		MemPerc: container.MemPerc,
		MemUsage: container.MemUsage,
		NetIO: container.NetIO,
		BlockIO: container.BlockIO,
		PIDs: container.PIDs,
	};
}

function areContainerStatsEqual(
	left: ContainerStats | undefined,
	right: ContainerStats | undefined,
) {
	return (
		left?.CPUPerc === right?.CPUPerc &&
		left?.MemPerc === right?.MemPerc &&
		left?.MemUsage === right?.MemUsage &&
		left?.NetIO === right?.NetIO &&
		left?.BlockIO === right?.BlockIO &&
		left?.PIDs === right?.PIDs
	);
}

function mergeContainerStats(
	current: Record<string, ContainerStats>,
	incoming: Record<string, ContainerStats>,
) {
	let changed = false;
	const next: Record<string, ContainerStats> = {};

	for (const [name, stats] of Object.entries(incoming)) {
		const existing = current[name];
		if (areContainerStatsEqual(existing, stats)) {
			if (existing) {
				next[name] = existing;
			}
			continue;
		}
		next[name] = stats;
		changed = true;
	}

	if (Object.keys(current).length !== Object.keys(incoming).length) {
		changed = true;
	}

	return changed ? next : current;
}

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
			setContainerStats((current) => mergeContainerStats(current, pendingRef.current || {}));
			pendingRef.current = null;
			lastFlushRef.current = Date.now();
		}
	}, []);

	useEffect(() => {
		const client = getSocket();
		const metricsSubscription = {
			environmentId: input.environmentId,
			environmentKind: input.environmentKind,
		} as const;
		subscribeMetrics(metricsSubscription);

		const onMetrics = (payload: RuntimePayload) => {
			if (payload.environmentId) {
				const expectedEnvironmentId =
					input.environmentKind === "local" ? "local" : input.environmentId;
				const isMatch = payload.environmentId === expectedEnvironmentId;
				if (!isMatch) return;
			}

			const next: Record<string, ContainerStats> = {};
			for (const container of payload.containers) {
				if (container.Name) {
					const name = container.Name.replace(/^\//, "");
					next[name] = toRowStats(container);
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
			unsubscribeMetrics(metricsSubscription);
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
