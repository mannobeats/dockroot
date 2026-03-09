"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LogBlock } from "@/components/ui/log-block";
import { Panel } from "@/components/ui/panel";
import { getSocket } from "@/lib/socket-client";

interface StackEvent {
	deploymentId: string;
	message?: string;
	stream?: "stdout" | "stderr";
	status?: "succeeded" | "failed";
	at: number;
}

export function LiveStackFeed({
	stackId,
	initialLog,
	height = "min(60vh, 640px)",
}: {
	stackId: string;
	initialLog?: string | null;
	height?: string;
}) {
	const [events, setEvents] = useState<StackEvent[]>([]);

	useEffect(() => {
		const client = getSocket();
		const room = `stack:${stackId}`;

		client.emit("room:join", room);

		const onLog = (event: StackEvent) => {
			setEvents((current) => [...current.slice(-199), event]);
		};

		const onComplete = (event: StackEvent) => {
			setEvents((current) => [...current.slice(-199), event]);
		};

		client.on("stack:log", onLog);
		client.on("deployment:complete", onComplete);

		return () => {
			client.emit("room:leave", room);
			client.off("stack:log", onLog);
			client.off("deployment:complete", onComplete);
		};
	}, [stackId]);

	const feed = useMemo(() => {
		const live = events
			.map((event) => {
				if (event.message) {
					return event.message;
				}

				return `[${new Date(event.at).toLocaleTimeString()}] deployment ${event.status}`;
			})
			.join("");

		return `${initialLog || ""}${live}`.trim();
	}, [events, initialLog]);

	return (
		<Panel className="bg-console p-4">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-semibold text-console-foreground">Live logs</p>
					<p className="text-xs text-console-foreground/50">Live deployment output</p>
				</div>
				<Badge variant="accent" className="rounded-full px-2.5 py-1 text-[11px]">
					Live
				</Badge>
			</div>
			<div className="mt-4 min-h-[320px]" style={{ height, maxHeight: height }}>
				<LogBlock className="h-full border-0 bg-transparent p-0 text-console-foreground/90">
					{feed || "No logs yet."}
				</LogBlock>
			</div>
		</Panel>
	);
}
