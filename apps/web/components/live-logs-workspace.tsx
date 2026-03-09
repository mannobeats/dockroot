"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { Panel } from "@/components/ui/panel";
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
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
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

	useEffect(() => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("mode", mode);

		if (mode === "grouped") {
			params.delete("container");
			if (selectedIds.length) {
				params.set("containers", selectedIds.join(","));
			} else {
				params.delete("containers");
			}
		} else {
			params.delete("containers");
			if (selectedIds[0]) {
				params.set("container", selectedIds[0]);
			} else {
				params.delete("container");
			}
		}

		if (params.toString() === searchParams.toString()) {
			return;
		}

		router.replace(`${pathname}?${params.toString()}`, { scroll: false });
	}, [mode, pathname, router, searchParams, selectedIds]);

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
		<div className="grid gap-5 xl:grid-cols-[300px_1fr]">
			{/* Container selector */}
			<Panel padding="md">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold tracking-tight">Containers</p>
					<div className="flex items-center gap-1">
						<Button
							type="button"
							onClick={() => {
								setMode("single");
								setSelectedIds((current) => (current[0] ? [current[0]] : current));
							}}
							variant={mode === "single" ? "secondary" : "outline"}
							size="xs"
						>
							Single
						</Button>
						<Button
							type="button"
							onClick={() => setMode("grouped")}
							variant={mode === "grouped" ? "secondary" : "outline"}
							size="xs"
						>
							Grouped
						</Button>
					</div>
				</div>
				<Input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Filter..."
					inputSize="sm"
					className="mt-3 text-xs"
					aria-label="Filter containers"
				/>
				<div className="mt-3 space-y-1">
					{filtered.length ? (
						filtered.map((container) => {
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
									className={`block w-full rounded-xl px-3.5 py-3 text-left text-xs transition-all duration-200 ${
										active
											? "bg-accent/8 text-foreground shadow-[var(--shadow-xs)]"
											: "text-muted hover:bg-foreground/[0.03] hover:text-foreground"
									}`}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="truncate font-medium">{container.name}</p>
											<p className="mt-0.5 truncate text-muted">{container.image}</p>
										</div>
										<StatusBadge status={container.state} />
									</div>
								</button>
							);
						})
					) : (
						<EmptyState
							title="No matching containers"
							description="Try a different name, image, or container id."
							className="p-4"
						/>
					)}
				</div>
			</Panel>

			{/* Log viewer */}
			<Panel padding="md">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-semibold tracking-tight">
							{mode === "grouped"
								? "Grouped logs"
								: containers.find((item) => item.id === selectedIds[0])?.name || "Logs"}
						</p>
						<p className="text-xs text-muted">
							{mode === "grouped" ? `${selectedIds.length} containers` : "docker logs -f"}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						<Button
							type="button"
							onClick={() => setPaused((current) => !current)}
							variant="outline"
							size="xs"
						>
							{paused ? "Resume" : "Pause"}
						</Button>
						<Button
							type="button"
							onClick={() => setAutoScroll((current) => !current)}
							variant={autoScroll ? "secondary" : "outline"}
							size="xs"
						>
							Auto-scroll
						</Button>
						<Button
							onClick={() =>
								setLogsByContainer((current) =>
									Object.fromEntries(Object.keys(current).map((key) => [key, ""])),
								)
							}
							variant="outline"
							size="xs"
						>
							Clear
						</Button>
						{selectedIds[0] ? (
							<LinkButton
								href={`/dashboard/shell?target=container&containerId=${selectedIds[0]}${environmentId ? `&environment=${environmentId}` : ""}`}
								variant="outline"
								size="xs"
							>
								Shell
							</LinkButton>
						) : null}
					</div>
				</div>
				<LogBlock ref={logViewportRef} className="mt-3 h-[680px] p-4">
					{combinedLogs || "No logs available."}
				</LogBlock>
			</Panel>
		</div>
	);
}
