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
		<Panel
			padding="sm"
			className="overflow-hidden border-default/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))]"
		>
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_360px]">
				<div className="space-y-4">
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search running containers by name, image, or id"
							withIcon
							className="h-11 rounded-xl bg-background/70"
						/>
					</div>

					<div className="grid max-h-[320px] gap-3 overflow-y-auto pr-1">
						{filteredContainers.length === 0 ? (
							<div className="rounded-2xl border border-dashed border-default/10 bg-background/30 px-4 py-10 text-center">
								<p className="text-sm font-medium">No matching containers</p>
								<p className="mt-1 text-xs text-muted">
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
											"rounded-2xl border px-4 py-4 text-left transition-all duration-150",
											"bg-background/35 hover:border-accent/40 hover:bg-background/55",
											isSelected
												? "border-accent/60 bg-accent/10 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_48px_rgba(59,130,246,0.12)]"
												: "border-default/10",
										)}
									>
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<span
														className={cn(
															"size-2 rounded-full",
															container.state.toLowerCase() === "running"
																? "bg-success shadow-[0_0_16px_rgba(34,197,94,0.7)]"
																: "bg-muted",
														)}
													/>
													<p className="truncate text-sm font-semibold">{container.name}</p>
												</div>
												<p className="mt-2 truncate text-xs text-muted">{container.image}</p>
											</div>
											<StatusBadge status={container.state} />
										</div>
										<div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
											<span className="truncate">{container.status}</span>
											<span className="font-mono text-[11px] text-muted/80">
												{container.id.slice(0, 12)}
											</span>
										</div>
									</button>
								);
							})
						)}
					</div>
				</div>

				<div className="flex flex-col rounded-[24px] border border-default/10 bg-background/35 p-5">
					<div className="flex items-center gap-3">
						<div className="flex size-11 items-center justify-center rounded-2xl bg-accent/12 text-accent shadow-[0_0_28px_rgba(59,130,246,0.18)]">
							<TerminalSquare className="size-5" />
						</div>
						<div>
							<p className="text-xs uppercase tracking-[0.2em] text-muted">Shell target</p>
							<p className="text-lg font-semibold">Container shell</p>
						</div>
					</div>

					{selectedContainer ? (
						<div className="mt-5 rounded-[22px] border border-accent/20 bg-accent/8 p-4">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="truncate text-base font-semibold">{selectedContainer.name}</p>
									<p className="mt-1 truncate text-sm text-muted">{selectedContainer.image}</p>
								</div>
								<StatusBadge status={selectedContainer.state} />
							</div>
							<div className="mt-4 space-y-2 text-xs text-muted">
								<p className="truncate">
									<span className="text-foreground">Status:</span> {selectedContainer.status}
								</p>
								<p className="truncate font-mono text-[11px]">{selectedContainer.id}</p>
							</div>
						</div>
					) : (
						<div className="mt-5 rounded-[22px] border border-dashed border-default/10 bg-background/25 px-4 py-8 text-center">
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
						<div className="mb-3 space-y-2">
							<label
								htmlFor="shell-kind"
								className="block text-xs uppercase tracking-[0.14em] text-muted"
							>
								Shell type
							</label>
							<Select
								id="shell-kind"
								value={shell}
								onChange={(event) => setShell(event.target.value as ShellOption)}
								className="h-11 rounded-xl bg-background/70"
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
									placeholder="custom shell path (e.g. /bin/fish)"
									className="h-11 rounded-xl bg-background/70 font-mono text-xs"
									pattern="[-A-Za-z0-9_./]{1,120}"
									title="Use only letters, numbers, ., /, _, and -."
								/>
							) : null}
						</div>
						<Button
							type="submit"
							className="h-11 w-full rounded-xl"
							disabled={
								isPending || !selectedContainer || (shell === "custom" && !customShell.trim())
							}
						>
							{isPending ? "Attaching..." : `Attach to ${selectedContainer?.name || "container"}`}
						</Button>
					</form>

					<p className="mt-3 text-xs text-muted">
						Pick a running container on the left, then open the shell when you are ready.
					</p>
				</div>
			</div>
		</Panel>
	);
}
