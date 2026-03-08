"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "@/lib/socket-client";

interface LogContainer {
	id: string;
	name: string;
	image: string;
	state: string;
}

export function LiveLogsWorkspace({
	containers,
	initialLogs,
	initialMode,
	initialSelectedIds,
}: {
	containers: LogContainer[];
	initialLogs: Record<string, string>;
	initialMode: "single" | "grouped";
	initialSelectedIds: string[];
}) {
	const [query, setQuery] = useState("");
	const [mode, setMode] = useState<"single" | "grouped">(initialMode);
	const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
	const [logsByContainer, setLogsByContainer] = useState<Record<string, string>>(initialLogs);
	const sessionIdRef = useRef<string | null>(null);

	const filtered = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		return normalized
			? containers.filter((container) =>
					`${container.name} ${container.image} ${container.state}`
						.toLowerCase()
						.includes(normalized),
				)
			: containers;
	}, [containers, query]);

	useEffect(() => {
		if (!selectedIds.length && containers[0]) {
			setSelectedIds([containers[0].id]);
		}
	}, [containers, selectedIds.length]);

	useEffect(() => {
		const socket = getSocket();

		socket.emit(
			"logs:subscribe",
			{
				containerIds: selectedIds,
				tail: 150,
			},
			(response: { sessionId?: string }) => {
				if (response.sessionId) {
					sessionIdRef.current = response.sessionId;
				}
			},
		);

		const onData = (payload: { sessionId: string; containerId: string; chunk: string }) => {
			setLogsByContainer((current) => ({
				...current,
				[payload.containerId]: `${current[payload.containerId] || ""}${payload.chunk}`.slice(
					-20000,
				),
			}));
		};

		socket.on("logs:data", onData);

		return () => {
			if (sessionIdRef.current) {
				socket.emit("logs:unsubscribe", {
					sessionId: sessionIdRef.current,
				});
			}
			socket.off("logs:data", onData);
		};
	}, [selectedIds]);

	const combinedLogs = selectedIds
		.map((containerId) => {
			const container = containers.find((item) => item.id === containerId);
			const content = logsByContainer[containerId] || "";
			if (mode === "single") {
				return content;
			}

			return content
				.split("\n")
				.filter(Boolean)
				.map((line) => `[${container?.name || containerId}] ${line}`)
				.join("\n");
		})
		.join("\n");

	return (
		<div className="grid gap-5 xl:grid-cols-[320px_1fr]">
			<section className="rounded-2xl border border-default/15 bg-surface p-4">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold">Containers</p>
					<div className="flex items-center gap-2 rounded-xl border border-default/15 bg-background/50 p-1">
						<button
							type="button"
							onClick={() => {
								setMode("single");
								setSelectedIds((current) => (current[0] ? [current[0]] : current));
							}}
							className={`rounded-lg px-3 py-2 text-xs ${mode === "single" ? "bg-accent text-white" : "text-muted"}`}
						>
							Single
						</button>
						<button
							type="button"
							onClick={() => setMode("grouped")}
							className={`rounded-lg px-3 py-2 text-xs ${mode === "grouped" ? "bg-accent text-white" : "text-muted"}`}
						>
							Grouped
						</button>
					</div>
				</div>
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Filter containers"
					className="mt-4 h-11 w-full rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
				/>
				<div className="mt-4 space-y-2">
					{filtered.map((container) => {
						const active = selectedIds.includes(container.id);
						return (
							<button
								key={container.id}
								type="button"
								onClick={() =>
									setSelectedIds((current) => {
										if (mode === "single") {
											return [container.id];
										}

										return active
											? current.filter((value) => value !== container.id)
											: [...current, container.id];
									})
								}
								className={`block w-full rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
									active
										? "border-accent/30 bg-accent/10"
										: "border-default/10 bg-background/50 hover:border-default/20"
								}`}
							>
								<p className="font-medium">{container.name}</p>
								<p className="mt-1 text-xs text-muted">{container.image}</p>
								<p className="mt-1 text-xs text-muted">{container.state}</p>
							</button>
						);
					})}
				</div>
			</section>

			<section className="rounded-2xl border border-default/15 bg-surface p-4">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold">
							{mode === "grouped"
								? "Grouped live logs"
								: containers.find((item) => item.id === selectedIds[0])?.name || "Live logs"}
						</p>
						<p className="text-xs text-muted">
							{mode === "grouped"
								? `${selectedIds.length} containers selected`
								: "Streaming docker logs -f"}
						</p>
					</div>
					{selectedIds[0] ? (
						<Link
							href={`/dashboard/shell?target=container&containerId=${selectedIds[0]}`}
							className="inline-flex h-9 items-center justify-center rounded-lg border border-default/20 px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
						>
							Open shell
						</Link>
					) : null}
				</div>
				<pre className="mt-4 min-h-[720px] overflow-auto rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/85">
					{combinedLogs || "No logs available for the selected container set."}
				</pre>
			</section>
		</div>
	);
}
