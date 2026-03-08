"use client";

import "xterm/css/xterm.css";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { getSocket } from "@/lib/socket-client";

export function TerminalPanel({
	target,
	containerId,
	label,
	transport = "local",
	environmentId,
}: {
	target: "host" | "container";
	containerId?: string;
	label: string;
	transport?: "local" | "remote";
	environmentId?: string;
}) {
	const terminalRef = useRef<HTMLDivElement | null>(null);
	const terminalInstanceRef = useRef<{ dispose: () => void; focus: () => void; write: (data: string) => void } | null>(null);
	const fitRef = useRef<{ fit: () => void } | null>(null);
	const sessionIdRef = useRef<string | null>(null);
	const cursorRef = useRef(0);
	const pollTimerRef = useRef<number | null>(null);
	const pendingChunksRef = useRef<Array<{ sessionId: string; data: string }>>([]);
	const pendingExitsRef = useRef<Array<{ sessionId: string; exitCode?: number }>>([]);
	const [status, setStatus] = useState("Connecting...");

	useEffect(() => {
		if (!terminalRef.current) {
			return;
		}

		let disposed = false;
		let cleanup = () => {};

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
					background: "#0a0a0a",
					foreground: "#fafafa",
					cursor: "#fafafa",
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
						terminal.write(payload.data);
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
				if (transport === "local" && sessionIdRef.current) {
					const socket = getSocket();
					socket.emit("terminal:resize", {
						sessionId: sessionIdRef.current,
						cols: terminal.cols,
						rows: terminal.rows,
					});
				}
				if (transport === "remote" && sessionIdRef.current && environmentId) {
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

			if (transport === "remote" && environmentId) {
				const createResponse = await fetch("/api/runtime/terminal", {
					method: "POST",
					headers: {
						"content-type": "application/json",
					},
					body: JSON.stringify({
						target,
						containerId,
						environmentId,
						cols: terminal.cols,
						rows: terminal.rows,
					}),
				});
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

				const disposable = terminal.onData((data) => {
					if (!sessionIdRef.current || !environmentId) {
						return;
					}

					void fetch(
						`/api/runtime/terminal/${encodeURIComponent(sessionIdRef.current)}?environmentId=${encodeURIComponent(environmentId)}`,
						{
							method: "POST",
							headers: {
								"content-type": "application/json",
							},
							body: JSON.stringify({
								type: "input",
								data,
							}),
						},
					);
				});

				const poll = async () => {
					if (!sessionIdRef.current || !environmentId) {
						return;
					}

					try {
						const response = await fetch(
							`/api/runtime/terminal/${encodeURIComponent(sessionIdRef.current)}?environmentId=${encodeURIComponent(environmentId)}&cursor=${cursorRef.current}`,
							{
								cache: "no-store",
							},
						);
						const payload = (await response.json()) as {
							chunks?: string[];
							cursor?: number;
							closed?: boolean;
							exitCode?: number;
							error?: string;
						};

						if (!response.ok) {
							setStatus(payload.error || "Remote shell disconnected.");
							return;
						}

						for (const chunk of payload.chunks || []) {
							terminal.write(chunk);
						}
						cursorRef.current = Number(payload.cursor || cursorRef.current);

						if (payload.closed) {
							setStatus(`Session closed (${payload.exitCode ?? 0})`);
							terminal.writeln(`\r\nSession closed (${payload.exitCode ?? 0}).`);
							return;
						}

						pollTimerRef.current = window.setTimeout(poll, 350);
					} catch {
						setStatus("Remote shell disconnected.");
					}
				};

				pollTimerRef.current = window.setTimeout(poll, 100);

				cleanup = () => {
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
					terminal.write(payload.data);
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
					target,
					containerId,
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
						terminal.write(response.initialData);
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
	}, [containerId, environmentId, label, target, transport]);

	return (
		<Panel padding="sm">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-semibold">Terminal</p>
					<p className="text-xs text-muted">{status}</p>
				</div>
				<Badge className="px-2.5 py-1 text-xs">
					{label}
				</Badge>
			</div>
			<div
				className="mt-3 overflow-hidden rounded-lg border border-default/10 bg-console"
				role="button"
				tabIndex={0}
				aria-label="Focus terminal"
				onClick={() => terminalInstanceRef.current?.focus()}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						terminalInstanceRef.current?.focus();
					}
				}}
			>
				<div ref={terminalRef} className="h-[600px] w-full p-3" />
			</div>
			<p className="mt-2 text-xs text-muted">
				Click inside the terminal to focus it, then type commands normally.
			</p>
		</Panel>
	);
}
