"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
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
	transport = "local",
	environmentId,
}: {
	containers: LogContainer[];
	initialLogs: Record<string, string>;
	initialMode: "single" | "grouped";
	initialSelectedIds: string[];
	transport?: "local" | "remote";
	environmentId?: string;
}) {
	const [query, setQuery] = useState("");
	const [mode, setMode] = useState<"single" | "grouped">(initialMode);
	const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
	const [logsByContainer, setLogsByContainer] = useState<Record<string, string>>(initialLogs);
	const [paused, setPaused] = useState(false);
	const [autoScroll, setAutoScroll] = useState(true);
	const sessionIdRef = useRef<string | null>(null);
	const logViewportRef = useRef<HTMLPreElement | null>(null);

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

	const onData = useEffectEvent(
		(payload: { sessionId: string; containerId: string; chunk: string }) => {
			if (paused || payload.sessionId !== sessionIdRef.current) {
				return;
			}

			setLogsByContainer((current) => ({
				...current,
				[payload.containerId]: `${current[payload.containerId] || ""}${payload.chunk}`.slice(
					-20000,
				),
			}));
		},
	);

	useEffect(() => {
		if (transport !== "local") {
			return;
		}

		if (!selectedIds.length) {
			return;
		}

		const socket = getSocket();
		const previousSessionId = sessionIdRef.current;

		if (previousSessionId) {
			socket.emit("logs:unsubscribe", {
				sessionId: previousSessionId,
			});
		}

		setLogsByContainer((current) => ({
			...current,
			...Object.fromEntries(selectedIds.map((containerId) => [containerId, ""])),
		}));

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

		socket.on("logs:data", onData);

		return () => {
			const activeSessionId = sessionIdRef.current;
			if (activeSessionId) {
				socket.emit("logs:unsubscribe", {
					sessionId: activeSessionId,
				});
				sessionIdRef.current = null;
			}
			socket.off("logs:data", onData);
		};
	}, [selectedIds, transport]);

	useEffect(() => {
		if (transport !== "remote" || !environmentId || !selectedIds.length) {
			return;
		}

		let cancelled = false;

		const refreshLogs = async () => {
			if (paused) {
				return;
			}

			const entries = await Promise.all(
				selectedIds.map(async (containerId) => {
					const params = new URLSearchParams({
						environmentId,
						containerId,
						tail: "150",
					});
					const response = await fetch(`/api/runtime/logs?${params.toString()}`, {
						cache: "no-store",
					});
					const text = await response.text();
					return [containerId, text] as const;
				}),
			);

			if (!cancelled) {
				setLogsByContainer((current) => ({
					...current,
					...Object.fromEntries(entries),
				}));
			}
		};

		void refreshLogs();
		const interval = window.setInterval(() => {
			void refreshLogs();
		}, 2000);

		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [environmentId, paused, selectedIds, transport]);

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

	useEffect(() => {
		if (!autoScroll || !logViewportRef.current) {
			return;
		}

		logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight;
	});

	return (
		<div className="grid gap-4 xl:grid-cols-[280px_1fr]">
			{/* Container selector */}
			<div className="rounded-xl border border-default/10 bg-surface p-4">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold">Containers</p>
					<div className="flex items-center gap-1 rounded-lg border border-default/10 bg-background p-0.5">
						<button
							type="button"
							onClick={() => {
								setMode("single");
								setSelectedIds((current) => (current[0] ? [current[0]] : current));
							}}
							className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${mode === "single" ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
						>
							Single
						</button>
						<button
							type="button"
							onClick={() => setMode("grouped")}
							className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${mode === "grouped" ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
						>
							Grouped
						</button>
					</div>
				</div>
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Filter..."
					className="mt-3 h-8 w-full rounded-lg border border-default/10 bg-background px-3 text-xs outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
				/>
				<div className="mt-3 space-y-1">
					{filtered.map((container) => {
						const active = selectedIds.includes(container.id);
						return (
							<button
								key={container.id}
								type="button"
								onClick={() =>
									setSelectedIds((current) => {
										if (mode === "single") {
											return current[0] === container.id && current.length === 1
												? current
												: [container.id];
										}

										const next = active
											? current.filter((value) => value !== container.id)
											: [...current, container.id];
										return next;
									})
								}
								className={`block w-full rounded-lg px-3 py-2.5 text-left text-xs transition-all ${
									active
										? "bg-foreground/[0.06] text-foreground"
										: "text-muted hover:bg-foreground/[0.03] hover:text-foreground"
								}`}
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<p className="truncate font-medium">{container.name}</p>
										<p className="mt-0.5 truncate text-muted">{container.image}</p>
									</div>
									<span
										className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
											container.state === "running" ? "bg-emerald-500" : "bg-neutral-400"
										}`}
									/>
								</div>
							</button>
						);
					})}
				</div>
			</div>

			{/* Log viewer */}
			<div className="rounded-xl border border-default/10 bg-surface p-4">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold">
							{mode === "grouped"
								? "Grouped logs"
								: containers.find((item) => item.id === selectedIds[0])?.name || "Logs"}
						</p>
						<p className="text-xs text-muted">
							{mode === "grouped" ? `${selectedIds.length} containers` : "docker logs -f"}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						<button
							type="button"
							onClick={() => setPaused((current) => !current)}
							className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
						>
							{paused ? "Resume" : "Pause"}
						</button>
						<button
							type="button"
							onClick={() => setAutoScroll((current) => !current)}
							className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors ${
								autoScroll
									? "border-foreground/20 bg-foreground/[0.06] text-foreground"
									: "border-default/10 text-muted hover:text-foreground"
							}`}
						>
							Auto-scroll
						</button>
						<button
							type="button"
							onClick={() =>
								setLogsByContainer((current) =>
									Object.fromEntries(Object.keys(current).map((key) => [key, ""])),
								)
							}
							className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
						>
							Clear
						</button>
						{selectedIds[0] ? (
							<Link
								href={`/dashboard/shell?target=container&containerId=${selectedIds[0]}`}
								className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
							>
								Shell
							</Link>
						) : null}
					</div>
				</div>
				<pre
					ref={logViewportRef}
					className="log-viewport mt-3 h-[680px] rounded-lg bg-[#0a0a0a] p-4 text-xs leading-5 text-white/85"
				>
					{combinedLogs || "No logs available."}
				</pre>
			</div>
		</div>
	);
}
