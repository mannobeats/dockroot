"use client";

import { useEffect, useState } from "react";
import type { ContainerStats, RuntimePayload } from "@/components/containers-table-workspace/types";
import { getSocket } from "@/lib/socket-client";

export function useRuntimeMetrics(input: {
	environmentId: string;
	environmentKind: "local" | "agent";
	initialWatchStackId?: string;
}) {
	const [containerStats, setContainerStats] = useState<Record<string, ContainerStats>>({});
	const [watchStackId, setWatchStackId] = useState(input.initialWatchStackId || "");
	const [logDockOpen, setLogDockOpen] = useState(Boolean(input.initialWatchStackId));

	useEffect(() => {
		const client = getSocket();

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
			setContainerStats(next);
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
		};
	}, [input.environmentId, input.environmentKind]);

	return {
		containerStats,
		watchStackId,
		setWatchStackId,
		logDockOpen,
		setLogDockOpen,
	};
}
