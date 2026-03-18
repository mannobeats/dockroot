"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { ShellSessionConfigurationPanel } from "@/components/shell/session-configuration-panel";
import { ShellSessionContainerSidebar } from "@/components/shell/session-container-sidebar";
import {
	matchesContainerSearch,
	type ShellContainerOption,
	type ShellOption,
} from "@/components/shell/shared";

export function ShellSessionControls({
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
	const [isPending, startTransition] = useTransition();
	const [query, setQuery] = useState("");
	const [containerId, setContainerId] = useState(initialContainerId || containers[0]?.id || "");
	const [shell, setShell] = useState<ShellOption>(initialShell || "sh");
	const [customShell, setCustomShell] = useState(initialCustomShell || "");
	const deferredQuery = useDeferredValue(query);

	const filteredContainers = useMemo(
		() => containers.filter((container) => matchesContainerSearch(container, deferredQuery)),
		[containers, deferredQuery],
	);

	const selectedContainer =
		containers.find((container) => container.id === containerId) || filteredContainers[0] || null;

	return (
		<div className="grid gap-5 xl:grid-cols-[300px_1fr]">
			<ShellSessionContainerSidebar
				query={query}
				filteredContainers={filteredContainers}
				selectedContainerId={selectedContainer?.id}
				onQueryChange={setQuery}
				onSelectContainer={setContainerId}
			/>

			<ShellSessionConfigurationPanel
				selectedContainer={selectedContainer}
				shell={shell}
				customShell={customShell}
				isPending={isPending}
				onShellChange={setShell}
				onCustomShellChange={setCustomShell}
				onSubmit={(event) => {
					event.preventDefault();

					startTransition(() => {
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

						router.push(`${pathname}?${params.toString()}`);
					});
				}}
			/>
		</div>
	);
}
