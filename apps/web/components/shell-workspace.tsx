"use client";

import "xterm/css/xterm.css";

import { Activity, Search, TerminalSquare } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { getSocket } from "@/lib/socket-client";

type ContainerOption = {
	id: string;
	name: string;
	state: string;
	status: string;
	image: string;
};
type ShellOption = "sh" | "bash" | "ash" | "zsh" | "custom";

const shellOptions: Array<{ value: ShellOption; label: string }> = [
	{ value: "sh", label: "sh" },
	{ value: "bash", label: "bash" },
	{ value: "ash", label: "ash" },
	{ value: "zsh", label: "zsh" },
	{ value: "custom", label: "Custom" },
];

function matchesSearch(container: ContainerOption, query: string) {
	const value = query.trim().toLowerCase();
	if (!value) {
		return true;
	}

	return [container.name, container.image, container.state, container.status, container.id]
		.filter(Boolean)
		.some((field) => field.toLowerCase().includes(value));
}

function sanitizeTerminalChunk(chunk: string) {
	return chunk.replaceAll(
		/(bash: cannot set terminal process group \(-1\): Not a tty\r?\n|bash: no job control in this shell\r?\n|sh: can't access tty; job control turned off\r?\n)/g,
		"",
	);
}

function getCssColorValue(variable: string, fallback: string) {
	if (typeof window === "undefined") {
		return fallback;
	}

	const value = window.getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
	return value || fallback;
}

export function ShellWorkspace({
	environmentId,
	containers,
	initialContainerId,
	initialShell,
	initialCustomShell,
}: {
	environmentId: string;
	containers: ContainerOption[];
	initialContainerId?: string;
	initialShell?: ShellOption;
	initialCustomShell?: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	/* ── sidebar state ── */
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const [containerId, setContainerId] = useState(initialContainerId || containers[0]?.id || "");

	/* ── shell config state ── */
	const [shell, setShell] = useState<ShellOption>(initialShell || "sh");
	const [customShell, setCustomShell] = useState(initialCustomShell || "");

	/* ── terminal state ── */
	const [status, setStatus] = useState("Connecting...");
	const [attached, setAttached] = useState(Boolean(initialContainerId));
	const terminalRef = useRef<HTMLDivElement | null>(null);
	const terminalInstanceRef = useRef<{
		dispose: () => void;
		focus: () => void;
		write: (data: string) => void;
	} | null>(null);
	const fitRef = useRef<{ fit: () => void } | null>(null);
	const sessionIdRef = useRef<string | null>(null);
	const cursorRef = useRef(0);
	const pollTimerRef = useRef<number | null>(null);
	const pendingChunksRef = useRef<Array<{ sessionId: string; data: string }>>([]);
	const pendingExitsRef = useRef<Array<{ sessionId: string; exitCode?: number }>>([]);

	const filteredContainers = useMemo(
		() => containers.filter((container) => matchesSearch(container, deferredQuery)),
		[containers, deferredQuery],
	);

	const selectedContainer =
		containers.find((container) => container.id === containerId) || filteredContainers[0] || null;
	const selectedContainerId = selectedContainer?.id || "";
	const selectedContainerName = selectedContainer?.name || "Container";
	const containerNameRef = useRef(selectedContainerName);
	containerNameRef.current = selectedContainerName;

	/* ── select a container and navigate ── */
	function selectContainer(id: string) {
		setContainerId(id);
	}

	function handleAttach() {
		const params = new URLSearchParams(searchParams.toString());
		params.set("environment", environmentId);

		if (selectedContainer?.id) {
			params.set("containerId", selectedContainer.id);
		} else {
			params.delete("containerId");
		}
		params.set("shell", shell);
		if (shell === "custom" && customShell.trim()) {
			params.set("customShell", customShell.trim());
		} else {
			params.delete("customShell");
		}

		setAttached(true);
		router.push(`${pathname}?${params.toString()}`);
	}

	/* ── Terminal lifecycle ── */
	useEffect(() => {
		if (!attached || !terminalRef.current || !selectedContainerId) {
			return;
		}

		let disposed = false;
		let cleanup = () => {};
		const containerId = selectedContainerId;
		const label = containerNameRef.current;

		void (async () => {
			const [{ FitAddon }, { WebLinksAddon }, { Terminal }] = await Promise.all([
				import("@xterm/addon-fit"),
				import("@xterm/addon-web-links"),
				import("xterm"),
			]);

			if (disposed || !terminalRef.current) {
				return;
			}

			const terminal = new Terminal({
				convertEol: true,
				cursorBlink: true,
				fontFamily:
					"ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace",
				fontSize: 13,
				lineHeight: 1.4,
				theme: {
					background: getCssColorValue("--console", "#0a0a0a"),
					foreground: getCssColorValue("--console-foreground", "#fafafa"),
					cursor: getCssColorValue("--console-foreground", "#fafafa"),
					selectionBackground: "#ffffff30",
				},
			});
			const fitAddon = new FitAddon();
			terminal.loadAddon(fitAddon);
			terminal.loadAddon(new WebLinksAddon());
			terminal.open(terminalRef.current);
			fitAddon.fit();
			terminal.focus();
			terminalInstanceRef.current = terminal;
			fitRef.current = fitAddon;
			cursorRef.current = 0;
			pendingChunksRef.current = [];
			pendingExitsRef.current = [];

			const flushPendingSocketEvents = (sessionId: string) => {
				for (const payload of pendingChunksRef.current) {
					if (payload.sessionId === sessionId) {
						terminal.write(sanitizeTerminalChunk(payload.data));
					}
				}
				pendingChunksRef.current = pendingChunksRef.current.filter(
					(payload) => payload.sessionId !== sessionId,
				);

				for (const payload of pendingExitsRef.current) {
					if (payload.sessionId === sessionId) {
						setStatus(`Session closed (${payload.exitCode ?? 0})`);
						terminal.writeln(`\r\nSession closed (${payload.exitCode ?? 0}).`);
					}
				}
				pendingExitsRef.current = pendingExitsRef.current.filter(
					(payload) => payload.sessionId !== sessionId,
				);
			};

			const resizeObserver = new ResizeObserver(() => {
				fitAddon.fit();
				if (sessionIdRef.current && environmentId) {
					void fetch(
						`/api/runtime/terminal/${encodeURIComponent(sessionIdRef.current)}?environmentId=${encodeURIComponent(environmentId)}`,
						{
							method: "POST",
							headers: {
								"content-type": "application/json",
							},
							body: JSON.stringify({
								type: "resize",
								cols: terminal.cols,
								rows: terminal.rows,
							}),
						},
					);
				}
			});
			resizeObserver.observe(terminalRef.current);

			if (environmentId) {
				const abortController = new AbortController();

				const createResponse = await fetch("/api/runtime/terminal", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						target: "container",
						containerId,
						environmentId,
						shell,
						customShell,
						cols: terminal.cols,
						rows: terminal.rows,
					}),
					signal: abortController.signal,
				});

				if (abortController.signal.aborted) {
					resizeObserver.disconnect();
					return;
				}

				const createPayload = (await createResponse.json()) as {
					sessionId?: string;
					error?: string;
				};

				if (!createResponse.ok || !createPayload.sessionId) {
					setStatus(createPayload.error || "Unable to start shell session.");
					terminal.writeln(`\r\n${createPayload.error || "Unable to start shell session."}`);
					resizeObserver.disconnect();
					return;
				}

				sessionIdRef.current = createPayload.sessionId;
				setStatus(`Connected to ${label}`);
				let writeQueue: Promise<void> = Promise.resolve();
				let writeQueueClosed = false;

				const disposable = terminal.onData((data) => {
					if (!sessionIdRef.current || !environmentId || abortController.signal.aborted) {
						return;
					}

					const activeSessionId = sessionIdRef.current;
					writeQueue = writeQueue
						.then(async () => {
							if (writeQueueClosed || abortController.signal.aborted || sessionIdRef.current !== activeSessionId) {
								return;
							}
							await fetch(
								`/api/runtime/terminal/${encodeURIComponent(activeSessionId)}?environmentId=${encodeURIComponent(environmentId)}`,
								{
									method: "POST",
									headers: {
										"content-type": "application/json",
									},
									body: JSON.stringify({
										type: "input",
										data,
									}),
									signal: abortController.signal,
								},
							);
						})
						.catch(() => {});
				});

				const poll = async () => {
					if (abortController.signal.aborted || !sessionIdRef.current || !environmentId) {
						return;
					}

					try {
						const response = await fetch(
							`/api/runtime/terminal/${encodeURIComponent(sessionIdRef.current)}?environmentId=${encodeURIComponent(environmentId)}&cursor=${cursorRef.current}&waitMs=1200`,
							{
								cache: "no-store",
								signal: abortController.signal,
							},
						);

						if (abortController.signal.aborted) {
							return;
						}

						const payload = (await response.json()) as {
							chunks?: string[];
							cursor?: number;
							closed?: boolean;
							exitCode?: number;
							error?: string;
						};

						if (!response.ok) {
							setStatus(payload.error || "Shell disconnected.");
							return;
						}

						for (const chunk of payload.chunks || []) {
							terminal.write(sanitizeTerminalChunk(chunk));
						}
						cursorRef.current = Number(payload.cursor || cursorRef.current);

						if (payload.closed) {
							setStatus(`Session closed (${payload.exitCode ?? 0})`);
							terminal.writeln(`\r\nSession closed (${payload.exitCode ?? 0}).`);
							return;
						}

						if (!abortController.signal.aborted) {
							const hasNewData = (payload.chunks?.length || 0) > 0;
							pollTimerRef.current = window.setTimeout(poll, hasNewData ? 40 : 140);
						}
					} catch {
						if (!abortController.signal.aborted) {
							setStatus("Shell disconnected.");
						}
					}
				};

				pollTimerRef.current = window.setTimeout(poll, 100);

				cleanup = () => {
					abortController.abort();
					writeQueueClosed = true;
					disposable.dispose();
					resizeObserver.disconnect();
					if (pollTimerRef.current) {
						window.clearTimeout(pollTimerRef.current);
						pollTimerRef.current = null;
					}
					if (sessionIdRef.current && environmentId) {
						void fetch(
							`/api/runtime/terminal/${encodeURIComponent(sessionIdRef.current)}?environmentId=${encodeURIComponent(environmentId)}`,
							{
								method: "DELETE",
							},
						);
					}
					terminal.dispose();
					terminalInstanceRef.current = null;
					fitRef.current = null;
					sessionIdRef.current = null;
				};

				return;
			}

			const socket = getSocket();

			const onData = (payload: { sessionId: string; data: string }) => {
				if (!sessionIdRef.current) {
					pendingChunksRef.current.push(payload);
					return;
				}

				if (payload.sessionId === sessionIdRef.current) {
					terminal.write(sanitizeTerminalChunk(payload.data));
				}
			};
			const onExit = (payload: { sessionId: string; exitCode?: number }) => {
				if (!sessionIdRef.current) {
					pendingExitsRef.current.push(payload);
					return;
				}

				if (payload.sessionId === sessionIdRef.current) {
					setStatus(`Session closed (${payload.exitCode ?? 0})`);
					terminal.writeln(`\r\nSession closed (${payload.exitCode ?? 0}).`);
				}
			};

			socket.on("terminal:data", onData);
			socket.on("terminal:exit", onExit);

			socket.emit(
				"terminal:create",
				{
					target: "container",
					containerId,
					shell,
					customShell,
					cols: terminal.cols,
					rows: terminal.rows,
				},
				(response: { sessionId?: string; initialData?: string; error?: string }) => {
					if (response.error || !response.sessionId) {
						setStatus(response.error || "Unable to start shell session.");
						terminal.writeln(`\r\n${response.error || "Unable to start shell session."}`);
						return;
					}

					sessionIdRef.current = response.sessionId;
					setStatus(`Connected to ${label}`);
					if (response.initialData) {
						terminal.write(sanitizeTerminalChunk(response.initialData));
					}
					flushPendingSocketEvents(response.sessionId);
					window.requestAnimationFrame(() => {
						terminal.focus();
					});
				},
			);

			const disposable = terminal.onData((data) => {
				if (!sessionIdRef.current) {
					return;
				}

				socket.emit("terminal:input", {
					sessionId: sessionIdRef.current,
					data,
				});
			});

			cleanup = () => {
				disposable.dispose();
				resizeObserver.disconnect();
				if (sessionIdRef.current) {
					socket.emit("terminal:close", {
						sessionId: sessionIdRef.current,
					});
				}
				socket.off("terminal:data", onData);
				socket.off("terminal:exit", onExit);
				terminal.dispose();
				terminalInstanceRef.current = null;
				fitRef.current = null;
				sessionIdRef.current = null;
				pendingChunksRef.current = [];
				pendingExitsRef.current = [];
			};
		})();

		return () => {
			disposed = true;
			cleanup();
		};
	}, [attached, selectedContainerId, customShell, environmentId, shell]);

	return (
		<div className="grid gap-5 xl:grid-cols-[300px_1fr]">
			{/* Container sidebar — mirrors LiveLogsWorkspace */}
			<Panel padding="md">
				<div className="flex items-center gap-2">
					<TerminalSquare className="h-4 w-4 text-accent" />
					<p className="text-sm font-semibold tracking-tight">Containers</p>
				</div>
				<div className="relative mt-3">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search..."
						withIcon
						inputSize="sm"
						className="text-xs"
						aria-label="Search containers"
					/>
				</div>

				<div className="mt-3 max-h-[680px] space-y-1 overflow-y-auto">
					{filteredContainers.length === 0 ? (
						<EmptyState
							title="No matching containers"
							description="Try a different name, image, or container id."
							className="p-4"
						/>
					) : (
						filteredContainers.map((container) => {
							const isSelected = container.id === selectedContainer?.id;

							return (
								<button
									key={container.id}
									type="button"
									onClick={() => selectContainer(container.id)}
									className={cn(
										"block w-full rounded-xl px-3.5 py-3 text-left text-xs transition-all duration-200",
										isSelected
											? "bg-accent/8 text-foreground shadow-[var(--shadow-xs)]"
											: "text-muted hover:bg-foreground/[0.03] hover:text-foreground",
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<div className="flex items-center gap-1.5">
												<span
													className={cn(
														"size-1.5 rounded-full",
														container.state.toLowerCase() === "running"
															? "bg-success"
															: "bg-muted/50",
													)}
												/>
												<p className="truncate font-medium text-[13px]">{container.name}</p>
											</div>
											<p className="mt-0.5 truncate text-muted pl-3">{container.image}</p>
										</div>
										<StatusBadge status={container.state} />
									</div>
								</button>
							);
						})
					)}
				</div>
			</Panel>

			{/* Terminal panel */}
			<Panel
				padding="sm"
				className="overflow-hidden"
				onMouseDown={() => terminalInstanceRef.current?.focus()}
			>
				{/* header bar — mirrors the log viewer header */}
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<p className="text-sm font-semibold tracking-tight">
								{selectedContainer?.name || "Shell"}
							</p>
							<Badge
								variant={status.startsWith("Connected") ? "success" : "default"}
								className="px-2 py-1 text-[11px]"
							>
								<Activity className="size-3" />
								{status.startsWith("Connected") ? "Live" : "Pending"}
							</Badge>
						</div>
						<p className="text-xs text-muted">
							{attached ? status : "Select a container and attach a shell"}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2 self-start">
						<Select
							id="shell-kind"
							value={shell}
							onChange={(event) => setShell(event.target.value as ShellOption)}
							className="h-7 w-[90px] text-xs"
							aria-label="Shell type"
						>
							{shellOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</Select>
						{shell === "custom" ? (
							<Input
								value={customShell}
								onChange={(event) => setCustomShell(event.target.value)}
								placeholder="/bin/fish"
								className="h-7 w-[120px] font-mono text-xs"
								pattern="[-A-Za-z0-9_./]{1,120}"
								title="Use only letters, numbers, ., /, _, and -."
								aria-label="Custom shell path"
							/>
						) : null}
						<Button type="button" onClick={handleAttach} size="xs" disabled={!selectedContainer}>
							Attach
						</Button>
					</div>
				</div>

				{/* terminal body */}
				{containers.length === 0 ? (
					<EmptyState
						title="No accessible containers available"
						description="Start a running container or deploy a stack before opening a shell."
						className="mt-4 p-8"
					/>
				) : !attached || !selectedContainer ? (
					<div className="mt-4 overflow-hidden rounded-[20px] border border-default/10 bg-console shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_80px_rgba(0,0,0,0.35)]">
						<div className="border-b border-default/10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] px-4 py-2">
							<div className="flex items-center gap-2 text-[11px] text-muted">
								<span className="size-2 rounded-full bg-muted/40" />
								<span>Interactive container session</span>
							</div>
						</div>
						<div className="flex h-[58vh] min-h-[340px] items-center justify-center p-4 sm:min-h-[420px] lg:min-h-[560px]">
							<div className="text-center">
								<TerminalSquare className="mx-auto size-8 text-muted/30" />
								<p className="mt-3 text-sm font-medium text-muted">
									Select a container and click Attach
								</p>
								<p className="mt-1 text-xs text-muted/60">to open an interactive shell session</p>
							</div>
						</div>
					</div>
				) : (
					<div className="mt-4 overflow-hidden rounded-[20px] border border-default/10 bg-console shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_80px_rgba(0,0,0,0.35)]">
						<div className="border-b border-default/10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] px-4 py-2">
							<div className="flex items-center gap-2 text-[11px] text-muted">
								<span className="size-2 rounded-full bg-success" />
								<span>Interactive container session</span>
							</div>
						</div>
						<div
							ref={terminalRef}
							className="h-[58vh] min-h-[340px] w-full p-4 sm:min-h-[420px] lg:min-h-[560px]"
						/>
					</div>
				)}
				<p className="mt-2 text-xs text-muted">
					Click inside the terminal to focus it, then type commands normally.
				</p>
			</Panel>
		</div>
	);
}
