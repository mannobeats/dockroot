"use client";

import { Search, TerminalSquare } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";

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

export function ShellSessionControls({
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
	const [isPending, startTransition] = useTransition();
	const [query, setQuery] = useState("");
	const [containerId, setContainerId] = useState(initialContainerId || containers[0]?.id || "");
	const [shell, setShell] = useState<ShellOption>(initialShell || "sh");
	const [customShell, setCustomShell] = useState(initialCustomShell || "");
	const deferredQuery = useDeferredValue(query);

	const filteredContainers = useMemo(
		() => containers.filter((container) => matchesSearch(container, deferredQuery)),
		[containers, deferredQuery],
	);

	const selectedContainer =
		containers.find((container) => container.id === containerId) || filteredContainers[0] || null;

	return (
		<div className="grid gap-5 xl:grid-cols-[300px_1fr]">
			{/* Container sidebar */}
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
						placeholder="Search containers..."
						withIcon
						inputSize="sm"
						className="text-xs"
					/>
				</div>

				<div className="mt-3 max-h-[400px] space-y-1 overflow-y-auto">
					{filteredContainers.length === 0 ? (
						<div className="rounded-xl border border-dashed border-default/10 bg-background/30 px-4 py-8 text-center">
							<p className="text-xs font-medium">No matching containers</p>
							<p className="mt-1 text-[11px] text-muted">
								Try a different name, image, or container id.
							</p>
						</div>
					) : (
						filteredContainers.map((container) => {
							const isSelected = container.id === selectedContainer?.id;

							return (
								<button
									key={container.id}
									type="button"
									onClick={() => setContainerId(container.id)}
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

			{/* Configuration panel */}
			<Panel padding="md">
				<div className="flex items-center gap-3">
					<div className="flex size-9 items-center justify-center rounded-xl bg-accent/8 text-accent">
						<TerminalSquare className="size-4" />
					</div>
					<div>
						<p className="text-sm font-semibold tracking-tight">Shell configuration</p>
						<p className="text-xs text-muted">Select a container and shell type to attach</p>
					</div>
				</div>

				{selectedContainer ? (
					<div className="mt-5 rounded-xl border border-default/8 bg-background/40 p-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold">{selectedContainer.name}</p>
								<p className="mt-0.5 truncate text-xs text-muted">{selectedContainer.image}</p>
							</div>
							<StatusBadge status={selectedContainer.state} />
						</div>
						<div className="mt-3 flex items-center gap-3 text-xs text-muted">
							<span className="truncate">{selectedContainer.status}</span>
							<span className="font-mono text-[11px] text-muted/60">
								{selectedContainer.id.slice(0, 12)}
							</span>
						</div>
					</div>
				) : (
					<div className="mt-5 rounded-xl border border-dashed border-default/10 bg-background/30 px-4 py-8 text-center">
						<p className="text-sm font-medium">Choose a container</p>
						<p className="mt-1 text-xs text-muted">
							Select one from the list to open an interactive shell.
						</p>
					</div>
				)}

				<form
					className="mt-5"
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
				>
					<div className="space-y-3">
						<div className="space-y-1.5">
							<label htmlFor="shell-kind" className="block text-xs font-medium text-muted">
								Shell type
							</label>
							<Select
								id="shell-kind"
								value={shell}
								onChange={(event) => setShell(event.target.value as ShellOption)}
							>
								{shellOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</Select>
						</div>
						{shell === "custom" ? (
							<div className="space-y-1.5">
								<label htmlFor="custom-shell-path" className="block text-xs font-medium text-muted">
									Custom shell path
								</label>
								<Input
									id="custom-shell-path"
									value={customShell}
									onChange={(event) => setCustomShell(event.target.value)}
									placeholder="/bin/fish"
									className="font-mono text-xs"
									pattern="[-A-Za-z0-9_./]{1,120}"
									title="Use only letters, numbers, ., /, _, and -."
								/>
							</div>
						) : null}
					</div>
					<Button
						type="submit"
						className="mt-4 w-full"
						disabled={
							isPending || !selectedContainer || (shell === "custom" && !customShell.trim())
						}
					>
						{isPending ? "Attaching..." : `Attach to ${selectedContainer?.name || "container"}`}
					</Button>
				</form>
			</Panel>
		</div>
	);
}
