import { TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import type { ShellContainerOption, ShellOption } from "./shared";
import { shellOptions } from "./shared";

export function ShellWorkspaceTerminalPanel({
	containers,
	selectedContainer,
	environmentId,
	shell,
	customShell,
	attached,
	status,
	terminalRef,
	onShellChange,
	onCustomShellChange,
	onAttach,
	onFocusTerminal,
}: {
	containers: ShellContainerOption[];
	selectedContainer: ShellContainerOption | null;
	environmentId: string;
	shell: ShellOption;
	customShell: string;
	attached: boolean;
	status: string;
	terminalRef: React.RefObject<HTMLDivElement | null>;
	onShellChange: (value: ShellOption) => void;
	onCustomShellChange: (value: string) => void;
	onAttach: () => void;
	onFocusTerminal: () => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<Panel
				padding="md"
				className="flex h-full min-h-0 flex-col overflow-hidden"
				onMouseDown={onFocusTerminal}
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
										onSelect={(value) => onShellChange(value as ShellOption)}
									>
										{option.label}
									</DropdownItem>
								))}
							</DropdownMenu>
						</Dropdown>
						{shell === "custom" ? (
							<Input
								value={customShell}
								onChange={(event) => onCustomShellChange(event.target.value)}
								placeholder="/bin/fish"
								className="h-7 w-[120px] font-mono text-xs"
								pattern="[-A-Za-z0-9_./]{1,120}"
								title="Use only letters, numbers, ., /, _, and -."
								aria-label="Custom shell path"
							/>
						) : null}
						<Button type="button" onClick={onAttach} size="xs" disabled={!selectedContainer}>
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
	);
}
