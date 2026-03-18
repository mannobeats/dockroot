import { Badge } from "@/components/ui/badge";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import type { UnifiedEvent } from "./types";
import { severityVariant, timeAgo } from "./utils";

export function EventLogTable({
	events,
	selected,
	allSelected,
	onToggleAll,
	onToggleOne,
	onOpenEvent,
}: {
	events: UnifiedEvent[];
	selected: Set<string>;
	allSelected: boolean;
	onToggleAll: () => void;
	onToggleOne: (eventId: string) => void;
	onOpenEvent: (event: UnifiedEvent) => void;
}) {
	return (
		<DataTable>
			<DataTableHeader>
				<tr>
					<DataTableHead className="w-8">
						<input
							type="checkbox"
							checked={allSelected}
							onChange={onToggleAll}
							className="h-3.5 w-3.5 rounded border-default/30 accent-accent"
						/>
					</DataTableHead>
					<DataTableHead className="w-24">Severity</DataTableHead>
					<DataTableHead>Type</DataTableHead>
					<DataTableHead>Resource</DataTableHead>
					<DataTableHead>Environment</DataTableHead>
					<DataTableHead>User</DataTableHead>
					<DataTableHead className="text-right">Time</DataTableHead>
				</tr>
			</DataTableHeader>
			<DataTableBody>
				{events.length === 0 ? (
					<DataTableEmpty colSpan={7}>No events found</DataTableEmpty>
				) : (
					events.map((event) => (
						<DataTableRow
							key={`${event.kind}-${event.id}`}
							className="cursor-pointer"
							onClick={() => onOpenEvent(event)}
						>
							<DataTableCell>
								<input
									type="checkbox"
									checked={selected.has(event.id)}
									onChange={() => onToggleOne(event.id)}
									onClick={(entryEvent) => entryEvent.stopPropagation()}
									className="h-3.5 w-3.5 rounded border-default/30 accent-accent"
								/>
							</DataTableCell>
							<DataTableCell>
								<Badge variant={severityVariant[event.severity] || "default"}>
									{event.severity}
								</Badge>
							</DataTableCell>
							<DataTableCell>
								<span className="font-mono text-xs">{event.actionType}</span>
							</DataTableCell>
							<DataTableCell>
								<div className="min-w-0">
									{event.resourceName ? (
										<p className="truncate text-xs font-medium">{event.resourceName}</p>
									) : event.containerId ? (
										<p className="truncate font-mono text-xs text-muted">
											{event.containerId.slice(0, 12)}
										</p>
									) : (
										<p className="text-xs text-muted">-</p>
									)}
								</div>
							</DataTableCell>
							<DataTableCell>
								{event.environmentName ? (
									<Badge variant="default">{event.environmentName}</Badge>
								) : (
									<span className="text-xs text-muted">-</span>
								)}
							</DataTableCell>
							<DataTableCell>
								<span className="text-xs text-muted">{event.userName || "System"}</span>
							</DataTableCell>
							<DataTableCell className="text-right">
								<span className="whitespace-nowrap text-xs text-muted">
									{timeAgo(event.timestamp)}
								</span>
							</DataTableCell>
						</DataTableRow>
					))
				)}
			</DataTableBody>
		</DataTable>
	);
}
