"use client";

import "xterm/css/xterm.css";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket-client";

export function TerminalPanel({
	target,
	containerId,
	label,
}: {
	target: "host" | "container";
	containerId?: string;
	label: string;
}) {
	const terminalRef = useRef<HTMLDivElement | null>(null);
	const terminalInstanceRef = useRef<{ dispose: () => void } | null>(null);
	const fitRef = useRef<{ fit: () => void } | null>(null);
	const sessionIdRef = useRef<string | null>(null);
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
				cursorBlink: true,
				fontFamily:
					"ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace",
				fontSize: 12,
				theme: {
					background: "#050914",
					foreground: "#f8fafc",
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

			const socket = getSocket();

			socket.emit(
				"terminal:create",
				{
					target,
					containerId,
					cols: terminal.cols,
					rows: terminal.rows,
				},
				(response: { sessionId?: string; error?: string }) => {
					if (response.error || !response.sessionId) {
						setStatus(response.error || "Unable to start shell session.");
						terminal.writeln(`\r\n${response.error || "Unable to start shell session."}`);
						return;
					}

					sessionIdRef.current = response.sessionId;
					setStatus(`Connected to ${label}`);
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

			const onData = (payload: { sessionId: string; data: string }) => {
				if (payload.sessionId === sessionIdRef.current) {
					terminal.write(payload.data);
				}
			};
			const onExit = (payload: { sessionId: string; exitCode?: number }) => {
				if (payload.sessionId === sessionIdRef.current) {
					setStatus(`Session closed (${payload.exitCode ?? 0})`);
					terminal.writeln(`\r\nSession closed (${payload.exitCode ?? 0}).`);
				}
			};

			socket.on("terminal:data", onData);
			socket.on("terminal:exit", onExit);

			const resizeObserver = new ResizeObserver(() => {
				fitAddon.fit();
				if (sessionIdRef.current) {
					socket.emit("terminal:resize", {
						sessionId: sessionIdRef.current,
						cols: terminal.cols,
						rows: terminal.rows,
					});
				}
			});
			resizeObserver.observe(terminalRef.current);

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
			};
		})();

		return () => {
			disposed = true;
			cleanup();
		};
	}, [containerId, label, target]);

	return (
		<div className="rounded-2xl border border-default/15 bg-surface p-4">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-semibold">Interactive shell</p>
					<p className="text-xs text-muted">{status}</p>
				</div>
				<div className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
					{label}
				</div>
			</div>
			<div className="mt-4 overflow-hidden rounded-xl border border-default/10 bg-[#050914]">
				<div ref={terminalRef} className="h-[620px] w-full p-3" />
			</div>
		</div>
	);
}
