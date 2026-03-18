import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { ShellContainerOption } from "./shared";

export function ShellWorkspaceContainerList({
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
		<div className="flex w-full flex-col xl:w-[300px] xl:shrink-0">
			<Panel padding="md" className="flex h-full flex-col overflow-hidden">
				<p className="text-sm font-semibold tracking-tight">Containers</p>
				<Input
					type="search"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder="Search..."
					inputSize="sm"
					className="mt-3 text-xs"
					aria-label="Search containers"
				/>
				<div className="mt-3 flex-1 space-y-1 overflow-y-auto">
					{filteredContainers.length ? (
						filteredContainers.map((container) => {
							const isSelected = container.id === selectedContainerId;

							return (
								<button
									key={container.id}
									type="button"
									onClick={() => onSelectContainer(container.id)}
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
	);
}
