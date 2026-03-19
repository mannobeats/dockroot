"use client";

import "@xterm/xterm/css/xterm.css";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import {
	matchesContainerSearch,
	type ShellContainerOption,
	type ShellOption,
} from "@/components/shell/shared";
import { ShellWorkspaceContainerList } from "@/components/shell/workspace-container-list";
import { ShellWorkspaceTerminalPanel } from "@/components/shell/workspace-terminal-panel";
import { useSocketTerminalSession } from "@/components/terminal/use-socket-terminal-session";

export function ShellWorkspace({
	environmentId,
	containers,
	initialContainerId,
	initialShell,
	initialCustomShell,
}: {
	environmentId: string;
	containers: ShellContainerOption[];
	initialContainerId?: string;
	initialShell?: ShellOption;
	initialCustomShell?: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const [containerId, setContainerId] = useState(initialContainerId || containers[0]?.id || "");
	const [shell, setShell] = useState<ShellOption>(initialShell || "sh");
	const [customShell, setCustomShell] = useState(initialCustomShell || "");
	const [attached, setAttached] = useState(Boolean(initialContainerId));

	const filteredContainers = useMemo(
		() => containers.filter((container) => matchesContainerSearch(container, deferredQuery)),
		[containers, deferredQuery],
	);

	const selectedContainer =
		containers.find((container) => container.id === containerId) || filteredContainers[0] || null;
	const selectedContainerId = selectedContainer?.id || "";
	const selectedContainerName = selectedContainer?.name || "Container";

	const { terminalRef, terminalInstanceRef, status } = useSocketTerminalSession({
		enabled: attached && Boolean(selectedContainerId),
		target: "container",
		containerId: selectedContainerId || undefined,
		environmentId,
		shell,
		customShell,
		label: selectedContainerName,
	});

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

	return (
		<div className="flex flex-col gap-5 xl:flex-row" style={{ height: "calc(100vh - 180px)" }}>
			<ShellWorkspaceContainerList
				query={query}
				filteredContainers={filteredContainers}
				selectedContainerId={selectedContainer?.id}
				onQueryChange={setQuery}
				onSelectContainer={setContainerId}
			/>

			<ShellWorkspaceTerminalPanel
				containers={containers}
				selectedContainer={selectedContainer}
				environmentId={environmentId}
				shell={shell}
				customShell={customShell}
				attached={attached}
				status={status}
				terminalRef={terminalRef}
				onShellChange={setShell}
				onCustomShellChange={setCustomShell}
				onAttach={handleAttach}
				onFocusTerminal={() => terminalInstanceRef.current?.focus()}
			/>
		</div>
	);
}
