import { ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { DataTableCell, DataTableRow } from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/link-button";
import type { StackRow } from "./types";
import { getContainerImage, getContainerName, getContainerState } from "./utils";

type StackRowServicesPanelProps = {
	stack: StackRow;
	rowKey: string;
	environmentId?: string;
};

export function StackRowServicesPanel({
	stack,
	rowKey,
	environmentId,
}: StackRowServicesPanelProps) {
	const environmentQuery = environmentId ? `?environment=${encodeURIComponent(environmentId)}` : "";

	return (
		<DataTableRow>
			<DataTableCell colSpan={8}>
				<div className="rounded-lg border border-default/8 bg-background/60 p-3">
					<div className="mb-2 flex items-center justify-between">
						<p className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">
							Services
						</p>
						<p className="text-xs text-muted">{stack.containers.length} container(s)</p>
					</div>
					{stack.containers.length ? (
						<div className="grid gap-1.5 lg:grid-cols-2 2xl:grid-cols-3">
							{stack.containers.map((container) => (
								<div
									key={`${rowKey}-${container.ID}`}
									className="flex items-center justify-between rounded-md border border-default/8 bg-surface px-3 py-2"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<p className="truncate text-sm font-medium">{getContainerName(container)}</p>
											<StatusBadge status={getContainerState(container)} />
										</div>
										<p className="truncate text-[11px] text-muted">
											{getContainerImage(container)}
										</p>
									</div>
									<LinkButton
										href={`/dashboard/containers/${container.ID}${environmentQuery}`}
										variant="ghost"
										size="icon-xs"
										title="Open container"
									>
										<ExternalLink className="h-3 w-3" />
									</LinkButton>
								</div>
							))}
						</div>
					) : (
						<p className="text-xs text-muted">No container services discovered for this stack.</p>
					)}
				</div>
			</DataTableCell>
		</DataTableRow>
	);
}
