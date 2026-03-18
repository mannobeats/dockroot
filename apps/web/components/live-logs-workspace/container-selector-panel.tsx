import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { LiveLogsMode, LogContainer } from "./types";

interface ContainerSelectorPanelProps {
	filteredContainers: LogContainer[];
	query: string;
	mode: LiveLogsMode;
	selectedIds: string[];
	onQueryChange: (value: string) => void;
	onModeChange: (mode: LiveLogsMode) => void;
	onSelectIds: (updater: (current: string[]) => string[]) => void;
}

export function ContainerSelectorPanel({
	filteredContainers,
	query,
	mode,
	selectedIds,
	onQueryChange,
	onModeChange,
	onSelectIds,
}: ContainerSelectorPanelProps) {
	return (
		<div className="flex w-full flex-col xl:w-[300px] xl:shrink-0">
			<Panel padding="md" className="flex h-full flex-col overflow-hidden">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold tracking-tight">Containers</p>
					<div className="flex items-center gap-1">
						<Button
							type="button"
							onClick={() => {
								onModeChange("single");
								onSelectIds((current) => (current[0] ? [current[0]] : current));
							}}
							variant={mode === "single" ? "secondary" : "outline"}
							size="xs"
						>
							Single
						</Button>
						<Button
							type="button"
							onClick={() => onModeChange("grouped")}
							variant={mode === "grouped" ? "secondary" : "outline"}
							size="xs"
						>
							Grouped
						</Button>
					</div>
				</div>
				<Input
					type="search"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder="Search..."
					inputSize="sm"
					className="mt-3 text-xs"
					aria-label="Filter containers"
				/>
				<div className="mt-3 flex-1 space-y-1 overflow-y-auto">
					{filteredContainers.length ? (
						filteredContainers.map((container) => {
							const active = selectedIds.includes(container.id);
							return (
								<button
									key={container.id}
									type="button"
									onClick={() =>
										onSelectIds((current) => {
											if (mode === "single") {
												return current[0] === container.id && current.length === 1
													? current
													: [container.id];
											}

											return active
												? current.filter((value) => value !== container.id)
												: [...current, container.id];
										})
									}
									className={`block w-full rounded-lg px-3 py-2.5 text-left text-xs transition-all duration-150 ${
										active
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
	);
}
