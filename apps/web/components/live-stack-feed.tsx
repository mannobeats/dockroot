"use client";

import { useEffect, useMemo, useState } from "react";
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
}: {
	stackId: string;
	initialLog?: string | null;
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
		<div className="rounded-xl border border-default/10 bg-[#0a0a0a] p-4">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-semibold text-white">Live logs</p>
					<p className="text-xs text-white/45">Socket.IO powered deployment feed</p>
				</div>
				<div className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
					Live
				</div>
			</div>
			<pre className="log-viewport mt-4 max-h-[480px] text-xs leading-6 text-white/80">
				{feed || "No logs yet."}
			</pre>
		</div>
	);
}
