import { ChevronsUpDown, Server } from "lucide-react";
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
							? `${selectedEnvironment.name} (${selectedEnvironment.kind})`
							: "Switch environment"
					}
					className="flex h-8 w-full items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
				>
					<Server className="h-3.5 w-3.5" />
				</button>
			) : (
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onToggle();
					}}
					className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-foreground/[0.04]"
				>
					<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06]">
						<Server className="h-3 w-3 text-muted" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-[12px] font-medium leading-tight">
							{selectedEnvironment?.name || "Select environment"}
						</p>
						<p className="truncate text-[10px] leading-tight text-muted">
							{selectedEnvironment?.kind || "none"}
						</p>
					</div>
					<ChevronsUpDown className="h-3 w-3 shrink-0 text-muted/60" />
				</button>
			)}

			{envOpen ? (
				<div
					role="listbox"
					onClick={(event) => event.stopPropagation()}
					onKeyDown={undefined}
					className={`absolute z-50 mt-1 overflow-hidden rounded-xl border border-default/12 bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)] ${
						collapsed ? "left-full top-0 ml-1 w-52" : "left-2 right-2"
					}`}
				>
					<div className="p-1">
						{environments.map((environment) => {
							const isActive = environment.id === selectedEnvironmentId;
							return (
								<button
									key={environment.id}
									type="button"
									role="option"
									aria-selected={isActive}
									onClick={() => onSelect(environment.id)}
									className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors duration-100 ${
										isActive
											? "bg-foreground/[0.06] text-foreground"
											: "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
									}`}
								>
									<div
										className={`h-1.5 w-1.5 shrink-0 rounded-full ${
											isActive ? "bg-accent" : "bg-default/20"
										}`}
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">{environment.name}</p>
									</div>
									<span className="shrink-0 text-[10px] text-muted">{environment.kind}</span>
								</button>
							);
						})}
					</div>
				</div>
			) : null}
		</div>
	);
}
