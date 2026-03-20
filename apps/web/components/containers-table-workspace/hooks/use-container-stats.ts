"use client";

import { useEffect, useRef, useState } from "react";
import type { ContainerStats } from "@/components/containers-table-workspace/types";
import { getSocket, subscribeContainerStats, unsubscribeContainerStats } from "@/lib/socket-client";

type ContainerStatsPayload = {
	containerId: string;
	cpuPercent: number;
	memoryUsageBytes: number;
	memoryLimitBytes: number;
	memoryPercent: number;
	networkRxBytes: number;
	networkTxBytes: number;
	blockReadBytes: number;
	blockWriteBytes: number;
	pids: number;
};

/**
 * Per-container stats hook (Arcane-inspired).
 *
 * Subscribes to per-container Docker stats streams via Socket.IO.
 * Each visible container gets its own streaming connection on the server.
 * Returns a map of containerId → stats with loading states.
 */
export function useContainerStats(input: {
	containerIds: string[];
	environmentId: string;
	environmentKind: "local" | "agent";
}) {
	const [statsMap, setStatsMap] = useState<Record<string, ContainerStats>>({});
	const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());
	const subscribedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		const client = getSocket();
		const desiredIds = new Set(input.containerIds);
		const currentIds = subscribedRef.current;

		// Subscribe to new containers
		for (const id of desiredIds) {
			if (!currentIds.has(id)) {
				setLoadingSet((prev) => new Set(prev).add(id));
				subscribeContainerStats({
					containerId: id,
					environmentKind: input.environmentKind,
					environmentId: input.environmentId,
				});
				currentIds.add(id);
			}
		}

		// Unsubscribe from removed containers
		for (const id of currentIds) {
			if (!desiredIds.has(id)) {
				unsubscribeContainerStats({
					containerId: id,
					environmentKind: input.environmentKind,
					environmentId: input.environmentId,
				});
				currentIds.delete(id);
				setStatsMap((prev) => {
					const next = { ...prev };
					delete next[id];
					return next;
				});
				setLoadingSet((prev) => {
					const next = new Set(prev);
					next.delete(id);
					return next;
				});
			}
		}

		const onStats = (payload: ContainerStatsPayload) => {
			if (!payload?.containerId) return;
			setLoadingSet((prev) => {
				if (!prev.has(payload.containerId)) return prev;
				const next = new Set(prev);
				next.delete(payload.containerId);
				return next;
			});
			setStatsMap((prev) => {
				const existing = prev[payload.containerId];
				// Skip update if values haven't changed (prevents unnecessary re-renders)
				if (
					existing &&
					existing.cpuPercent === payload.cpuPercent &&
					existing.memoryUsageBytes === payload.memoryUsageBytes &&
					existing.networkRxBytes === payload.networkRxBytes &&
					existing.networkTxBytes === payload.networkTxBytes
				) {
					return prev;
				}
				return {
					...prev,
					[payload.containerId]: {
						cpuPercent: payload.cpuPercent,
						memoryUsageBytes: payload.memoryUsageBytes,
						memoryLimitBytes: payload.memoryLimitBytes,
						memoryPercent: payload.memoryPercent,
						networkRxBytes: payload.networkRxBytes,
						networkTxBytes: payload.networkTxBytes,
						blockReadBytes: payload.blockReadBytes,
						blockWriteBytes: payload.blockWriteBytes,
						pids: payload.pids,
					},
				};
			});
		};

		client.on("container:stats", onStats);

		return () => {
			client.off("container:stats", onStats);
			// Unsubscribe all on unmount
			for (const id of currentIds) {
				unsubscribeContainerStats({
					containerId: id,
					environmentKind: input.environmentKind,
					environmentId: input.environmentId,
				});
			}
			currentIds.clear();
		};
	}, [input.containerIds, input.environmentId, input.environmentKind]);

	return { statsMap, loadingSet };
}
