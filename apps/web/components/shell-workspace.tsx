"use client";

import "xterm/css/xterm.css";

import { TerminalSquare } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { useSocketTerminalSession } from "@/components/terminal/use-socket-terminal-session";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";

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

	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const [containerId, setContainerId] = useState(initialContainerId || containers[0]?.id || "");

	const [shell, setShell] = useState<ShellOption>(initialShell || "sh");
	const [customShell, setCustomShell] = useState(initialCustomShell || "");
	const [attached, setAttached] = useState(Boolean(initialContainerId));

	const filteredContainers = useMemo(
		() => containers.filter((container) => matchesSearch(container, deferredQuery)),
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

	return (
		<div className="flex gap-5 xl:flex-row flex-col" style={{ height: "calc(100vh - 180px)" }}>
			<div className="flex w-full flex-col xl:w-[300px] xl:shrink-0">
				<Panel padding="md" className="flex h-full flex-col overflow-hidden">
					<p className="text-sm font-semibold tracking-tight">Containers</p>
					<Input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search..."
						inputSize="sm"
						className="mt-3 text-xs"
						aria-label="Search containers"
					/>
					<div className="mt-3 flex-1 space-y-1 overflow-y-auto">
						{filteredContainers.length ? (
							filteredContainers.map((container) => {
								const isSelected = container.id === selectedContainer?.id;

								return (
									<button
										key={container.id}
										type="button"
										onClick={() => selectContainer(container.id)}
										className={`block w-full rounded-lg px-3 py-2.5 text-left text-xs transition-all duration-150 ${
											isSelected
												? "bg-foreground/[0.06] text-foreground"
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
			</div>

			<div className="flex min-h-0 flex-1 flex-col">
				<Panel
					padding="md"
					className="flex h-full min-h-0 flex-col overflow-hidden"
					onMouseDown={() => terminalInstanceRef.current?.focus()}
				>
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm font-semibold tracking-tight">
								{selectedContainer?.name || "Shell"}
							</p>
							<p className="text-xs text-muted">
								{attached ? status : "Select a container and attach a shell"}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-1.5">
							<Dropdown className="w-[90px]">
								<DropdownTrigger size="sm">{shell === "custom" ? "Custom" : shell}</DropdownTrigger>
								<DropdownMenu>
									{shellOptions.map((option) => (
										<DropdownItem
											key={option.value}
											value={option.value}
											selected={shell === option.value}
											onSelect={(v) => setShell(v as ShellOption)}
										>
											{option.label}
										</DropdownItem>
									))}
								</DropdownMenu>
							</Dropdown>
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
							{selectedContainer ? (
								<LinkButton
									href={`/dashboard/logs?container=${selectedContainer.id}${environmentId ? `&environment=${environmentId}` : ""}`}
									variant="outline"
									size="xs"
								>
									Logs
								</LinkButton>
							) : null}
						</div>
					</div>

					{containers.length === 0 ? (
						<div className="mt-3 flex flex-1 items-center justify-center rounded-lg border border-default/10 bg-console">
							<EmptyState
								title="No accessible containers available"
								description="Start a running container or deploy a stack before opening a shell."
								className="p-8"
							/>
						</div>
					) : !attached || !selectedContainer ? (
						<div className="mt-3 flex flex-1 items-center justify-center rounded-lg border border-default/10 bg-console">
							<div className="text-center">
								<TerminalSquare className="mx-auto size-8 text-muted/30" />
								<p className="mt-3 text-sm font-medium text-muted">
									Select a container and click Attach
								</p>
								<p className="mt-1 text-xs text-muted/60">to open an interactive shell session</p>
							</div>
						</div>
					) : (
						<div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-lg border border-default/10 bg-console">
							<div ref={terminalRef} className="absolute inset-0 p-4" />
						</div>
					)}
				</Panel>
			</div>
		</div>
	);
}
