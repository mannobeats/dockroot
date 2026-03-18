import { TerminalSquare } from "lucide-react";
import type { FormEvent } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { ShellContainerOption, ShellOption } from "./shared";
import { shellOptions } from "./shared";

export function ShellSessionConfigurationPanel({
	selectedContainer,
	shell,
	customShell,
	isPending,
	onShellChange,
	onCustomShellChange,
	onSubmit,
}: {
	selectedContainer: ShellContainerOption | null;
	shell: ShellOption;
	customShell: string;
	isPending: boolean;
	onShellChange: (value: ShellOption) => void;
	onCustomShellChange: (value: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
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

			<form className="mt-5" onSubmit={onSubmit}>
				<div className="space-y-3">
					<div className="space-y-1.5">
						<label htmlFor="shell-kind" className="block text-xs font-medium text-muted">
							Shell type
						</label>
						<Dropdown>
							<DropdownTrigger size="sm">{shell === "custom" ? "Custom" : shell}</DropdownTrigger>
							<DropdownMenu>
								{shellOptions.map((option) => (
									<DropdownItem
										key={option.value}
										value={option.value}
										selected={shell === option.value}
										onSelect={(value) => onShellChange(value as ShellOption)}
									>
										{option.label}
									</DropdownItem>
								))}
							</DropdownMenu>
						</Dropdown>
					</div>
					{shell === "custom" ? (
						<div className="space-y-1.5">
							<label htmlFor="custom-shell-path" className="block text-xs font-medium text-muted">
								Custom shell path
							</label>
							<Input
								id="custom-shell-path"
								value={customShell}
								onChange={(event) => onCustomShellChange(event.target.value)}
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
					disabled={isPending || !selectedContainer || (shell === "custom" && !customShell.trim())}
				>
					{isPending ? "Attaching..." : `Attach to ${selectedContainer?.name || "container"}`}
				</Button>
			</form>
		</Panel>
	);
}
