"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket-client";

type ShellOption = "sh" | "bash" | "ash" | "zsh" | "custom";

type UseSocketTerminalSessionInput = {
	enabled: boolean;
	target: "container";
	containerId?: string;
	environmentId?: string;
	shell?: ShellOption;
	customShell?: string;
	label: string;
};

function getCssColorValue(variable: string, fallback: string) {
	if (typeof window === "undefined") {
		return fallback;
	}

	const value = window.getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
	return value || fallback;
}

export function useSocketTerminalSession(input: UseSocketTerminalSessionInput) {
	const terminalRef = useRef<HTMLDivElement | null>(null);
	const terminalInstanceRef = useRef<{
		dispose: () => void;
		focus: () => void;
		write: (data: string) => void;
	} | null>(null);
	const sessionIdRef = useRef<string | null>(null);
	const pendingChunksRef = useRef<Array<{ sessionId: string; data: string }>>([]);
	const pendingExitsRef = useRef<Array<{ sessionId: string; exitCode?: number }>>([]);
	const [status, setStatus] = useState("Connecting...");

	useEffect(() => {
		if (!input.enabled || !terminalRef.current) {
			return;
		}

		if (!input.containerId) {
			setStatus("No container selected.");
			return;
		}

		let disposed = false;
		let cleanup = () => {};
		setStatus("Connecting...");

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
				cursorStyle: "underline",
				fontFamily:
					"ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace",
				fontSize: 13,
				lineHeight: 1.4,
				scrollback: 5000,
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

			let resizeTimer: ReturnType<typeof setTimeout> | null = null;
			let lastCols = terminal.cols;
			let lastRows = terminal.rows;

			const resizeObserver = new ResizeObserver(() => {
				if (resizeTimer) {
					clearTimeout(resizeTimer);
				}

				resizeTimer = setTimeout(() => {
					resizeTimer = null;
					fitAddon.fit();
					if (terminal.cols === lastCols && terminal.rows === lastRows) {
						return;
					}

					lastCols = terminal.cols;
					lastRows = terminal.rows;
					if (sessionIdRef.current) {
						const socket = getSocket();
						socket.emit("terminal:resize", {
							sessionId: sessionIdRef.current,
							cols: terminal.cols,
							rows: terminal.rows,
						});
					}
				}, 80);
			});
			resizeObserver.observe(terminalRef.current);

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
					target: input.target,
					containerId: input.containerId,
					environmentId: input.environmentId,
					shell: input.shell,
					customShell: input.customShell,
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
					setStatus(`Connected to ${input.label}`);
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
				if (resizeTimer) {
					clearTimeout(resizeTimer);
				}
				if (sessionIdRef.current) {
					socket.emit("terminal:close", {
						sessionId: sessionIdRef.current,
					});
				}
				socket.off("terminal:data", onData);
				socket.off("terminal:exit", onExit);
				terminal.dispose();
				terminalInstanceRef.current = null;
				sessionIdRef.current = null;
				pendingChunksRef.current = [];
				pendingExitsRef.current = [];
			};
		})();

		return () => {
			disposed = true;
			cleanup();
		};
	}, [
		input.containerId,
		input.customShell,
		input.enabled,
		input.environmentId,
		input.label,
		input.shell,
		input.target,
	]);

	return {
		terminalRef,
		terminalInstanceRef,
		status,
	};
}
