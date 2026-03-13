"use client";

import { useEffect, useMemo, useState } from "react";
import { LogBlock } from "@/components/ui/log-block";
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
		<div className="rounded-xl border border-default/10 bg-console">
			{/* Terminal header */}
			<div className="flex items-center justify-between border-b border-default/5 px-3 py-2">
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1">
						<span className="h-2 w-2 rounded-full bg-danger/60" />
						<span className="h-2 w-2 rounded-full bg-warning/60" />
						<span className="h-2 w-2 rounded-full bg-success/60" />
					</div>
					<span className="text-[11px] font-medium text-console-foreground/50">Deploy log</span>
				</div>
				<span className="relative flex items-center gap-1.5">
					<span className="relative flex h-1.5 w-1.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
						<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
					</span>
					<span className="text-[10px] text-console-foreground/40">Live</span>
				</span>
			</div>
			{/* Terminal body */}
			<div className="min-h-[320px]" style={{ height, maxHeight: height }}>
				<LogBlock className="h-full border-0 bg-transparent p-3 text-[12px] text-console-foreground/85">
					{feed || "Waiting for deployment output..."}
				</LogBlock>
			</div>
		</div>
	);
}
