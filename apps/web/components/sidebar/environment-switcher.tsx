import { Check, ChevronsUpDown, Monitor } from "lucide-react";
import type { SidebarEnvironment } from "./types";

interface EnvironmentSwitcherProps {
	collapsed: boolean;
	envOpen: boolean;
	environments: SidebarEnvironment[];
	selectedEnvironmentId: string;
	selectedEnvironment?: SidebarEnvironment;
	onToggle: () => void;
	onSelect: (environmentId: string) => void;
}

function EnvironmentIcon({ className }: { className?: string }) {
	return <Monitor className={className} />;
}

function kindLabel(kind: string) {
	if (kind === "agent") return "Remote";
	if (kind === "local") return "Local";
	return kind;
}

export function EnvironmentSwitcher({
	collapsed,
	envOpen,
	environments,
	selectedEnvironmentId,
	selectedEnvironment,
	onToggle,
	onSelect,
}: EnvironmentSwitcherProps) {
	if (environments.length === 0) {
		return null;
	}

	return (
		<div
			className={`relative border-b border-default/8 ${collapsed ? "px-1 py-1.5" : "px-2 py-2"}`}
		>
			{collapsed ? (
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onToggle();
					}}
					title={
						selectedEnvironment
							? `${selectedEnvironment.name} (${kindLabel(selectedEnvironment.kind)})`
							: "Switch environment"
					}
					className={`flex h-8 w-full items-center justify-center rounded-lg transition-colors duration-150 ${
						envOpen
							? "bg-foreground/[0.06] text-foreground"
							: "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
					}`}
				>
					<EnvironmentIcon className="h-3.5 w-3.5" />
				</button>
			) : (
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onToggle();
					}}
					className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 ${
						envOpen ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.04]"
					}`}
				>
					<div
						className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
							selectedEnvironment?.kind === "agent"
								? "bg-violet-500/10 text-violet-500"
								: "bg-accent/10 text-accent"
						}`}
					>
						<EnvironmentIcon className="h-3.5 w-3.5" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-[12px] font-semibold leading-tight">
							{selectedEnvironment?.name || "Select environment"}
						</p>
						<p className="truncate text-[10px] leading-tight text-muted">
							{selectedEnvironment ? kindLabel(selectedEnvironment.kind) : "none"}
						</p>
					</div>
					<ChevronsUpDown
						className={`h-3 w-3 shrink-0 transition-colors ${
							envOpen ? "text-foreground" : "text-muted/40"
						}`}
					/>
				</button>
			)}

			{envOpen ? (
				<div
					role="listbox"
					onClick={(event) => event.stopPropagation()}
					onKeyDown={undefined}
					className={`absolute z-50 mt-1 overflow-hidden rounded-xl border border-default/12 bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.16)] ${
						collapsed ? "left-full top-0 ml-1 w-56" : "left-2 right-2"
					}`}
				>
					<div className="px-2.5 pb-1.5 pt-2.5">
						<p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/50">
							Environments
						</p>
					</div>
					<div className="px-1 pb-1">
						{environments.map((environment) => {
							const isActive = environment.id === selectedEnvironmentId;
							return (
								<button
									key={environment.id}
									type="button"
									role="option"
									aria-selected={isActive}
									onClick={() => onSelect(environment.id)}
									className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[12px] transition-colors duration-100 ${
										isActive
											? "bg-foreground/[0.06] text-foreground"
											: "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
									}`}
								>
									<div
										className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
											environment.kind === "agent"
												? "bg-violet-500/10 text-violet-500"
												: "bg-accent/10 text-accent"
										}`}
									>
										<EnvironmentIcon className="h-3 w-3" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">{environment.name}</p>
										<p className="text-[10px] text-muted">{kindLabel(environment.kind)}</p>
									</div>
									{isActive ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
								</button>
							);
						})}
					</div>
				</div>
			) : null}
		</div>
	);
}
