"use client";

import "xterm/css/xterm.css";

import { Activity } from "lucide-react";
import { useSocketTerminalSession } from "@/components/terminal/use-socket-terminal-session";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";

export function TerminalPanel({
	target,
	containerId,
	label,
	environmentId,
	shell = "sh",
	customShell,
}: {
	target: "container";
	containerId?: string;
	label: string;
	environmentId?: string;
	shell?: "sh" | "bash" | "ash" | "zsh" | "custom";
	customShell?: string;
}) {
	const { terminalRef, terminalInstanceRef, status } = useSocketTerminalSession({
		enabled: Boolean(containerId),
		target,
		containerId,
		environmentId,
		shell,
		customShell,
		label,
	});

	return (
		<Panel
			padding="sm"
			className="overflow-hidden"
			onMouseDown={() => terminalInstanceRef.current?.focus()}
		>
			<div className="flex flex-col gap-3 border-b border-default/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<p className="text-sm font-semibold">Shell</p>
						<Badge
							variant={status.startsWith("Connected") ? "success" : "default"}
							className="px-2 py-1 text-[11px]"
						>
							<Activity className="size-3" />
							{status.startsWith("Connected") ? "Live" : "Pending"}
						</Badge>
					</div>
					<p className="text-xs text-muted">{status}</p>
				</div>
				<div className="flex items-center gap-2 self-start">
					<Badge variant="accent" className="px-2.5 py-1 text-[11px]">
						Container
					</Badge>
					<Badge className="px-2.5 py-1 text-[11px]">{label}</Badge>
				</div>
			</div>
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
			<p className="mt-2 text-xs text-muted">
				Click inside the terminal to focus it, then type commands normally.
			</p>
		</Panel>
	);
}
