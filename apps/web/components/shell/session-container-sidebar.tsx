import { Search, TerminalSquare } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import type { ShellContainerOption } from "./shared";

export function ShellSessionContainerSidebar({
	query,
	filteredContainers,
	selectedContainerId,
	onQueryChange,
	onSelectContainer,
}: {
	query: string;
	filteredContainers: ShellContainerOption[];
	selectedContainerId?: string;
	onQueryChange: (value: string) => void;
	onSelectContainer: (id: string) => void;
}) {
	return (
		<Panel padding="md">
			<div className="flex items-center gap-2">
				<TerminalSquare className="h-4 w-4 text-accent" />
				<p className="text-sm font-semibold tracking-tight">Containers</p>
			</div>
			<div className="relative mt-3">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
				<Input
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
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
						const isSelected = container.id === selectedContainerId;

						return (
							<button
								key={container.id}
								type="button"
								onClick={() => onSelectContainer(container.id)}
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
											<p className="truncate text-[13px] font-medium">{container.name}</p>
										</div>
										<p className="mt-0.5 truncate pl-3 text-muted">{container.image}</p>
									</div>
									<StatusBadge status={container.state} />
								</div>
							</button>
						);
					})
				)}
			</div>
		</Panel>
	);
}
