"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { type EventDetail, EventDetailDrawer } from "@/components/event-detail-drawer";
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

export type UnifiedEvent = {
	id: string;
	kind: "deployment" | "runtime";
	severity: "info" | "success" | "warning" | "error";
	actionType: string;
	resourceName: string | null;
	environmentName: string | null;
	userName: string | null;
	source: string | null;
	containerId: string | null;
	details: string | null;
	log: string | null;
	status: string;
	timestamp: string;
	meta: Record<string, string | null>;
};

const severityVariant: Record<string, "success" | "accent" | "warning" | "danger" | "default"> = {
	success: "success",
	info: "accent",
	warning: "warning",
	error: "danger",
};

function timeAgo(dateStr: string) {
	const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
	if (seconds < 60) return "less than a minute ago";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days > 1 ? "s" : ""} ago`;
}

export function EventLogWorkspace({
	events,
	deleteAction,
	clearAllAction,
}: {
	events: UnifiedEvent[];
	deleteAction: (formData: FormData) => Promise<unknown>;
	clearAllAction: () => Promise<unknown>;
}) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isPending, startTransition] = useTransition();
	const [activeEvent, setActiveEvent] = useState<EventDetail | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);

	const allSelected = events.length > 0 && selected.size === events.length;

	const toggleAll = useCallback(() => {
		if (allSelected) {
			setSelected(new Set());
		} else {
			setSelected(new Set(events.map((e) => e.id)));
		}
	}, [allSelected, events]);

	const toggleOne = useCallback((id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const handleDeleteSelected = useCallback(() => {
		if (!selected.size) return;
		startTransition(async () => {
			const formData = new FormData();
			formData.set("eventIds", Array.from(selected).join(","));
			await deleteAction(formData);
			setSelected(new Set());
		});
	}, [selected, deleteAction]);

	const handleClearAll = useCallback(() => {
		startTransition(async () => {
			await clearAllAction();
			setSelected(new Set());
		});
	}, [clearAllAction]);

	const handleRowClick = useCallback((event: UnifiedEvent) => {
		setActiveEvent({
			id: event.id,
			kind: event.kind,
			title: event.actionType,
			status: event.status,
			severity: event.severity,
			timestamp: event.timestamp,
			environment: event.environmentName,
			user: event.userName,
			source: event.source,
			containerId: event.containerId,
			details: event.details,
			log: event.log,
			meta: event.meta,
		});
		setDrawerOpen(true);
	}, []);

	const counts = useMemo(() => {
		const c = { info: 0, success: 0, warning: 0, error: 0 };
		for (const e of events) {
			if (e.severity in c) c[e.severity as keyof typeof c]++;
		}
		return c;
	}, [events]);

	return (
		<div>
			{/* Stats bar */}
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-default/8 px-3 py-2 text-xs text-muted">
				<span className="font-semibold text-foreground">{events.length} total events</span>
				<span className="flex items-center gap-1">
					<span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
					{counts.info} info
				</span>
				<span className="flex items-center gap-1">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
					{counts.success} success
				</span>
				<span className="flex items-center gap-1">
					<span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
					{counts.warning} warning
				</span>
				<span className="flex items-center gap-1">
					<span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
					{counts.error} error
				</span>

				<div className="ml-auto flex items-center gap-2">
					{selected.size > 0 ? (
						<button
							type="button"
							disabled={isPending}
							onClick={handleDeleteSelected}
							className="flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-500 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
						>
							<Trash2 className="h-3 w-3" />
							Remove {selected.size} selected
						</button>
					) : null}
					{events.length > 0 ? (
						<button
							type="button"
							disabled={isPending}
							onClick={handleClearAll}
							className="text-[11px] font-medium text-muted transition-colors hover:text-rose-500 disabled:opacity-50"
						>
							Clear all
						</button>
					) : null}
				</div>
			</div>

			{/* Table */}
			<DataTable>
				<DataTableHeader>
					<tr>
						<DataTableHead className="w-8">
							<input
								type="checkbox"
								checked={allSelected}
								onChange={toggleAll}
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
								onClick={() => handleRowClick(event)}
							>
								<DataTableCell>
									<input
										type="checkbox"
										checked={selected.has(event.id)}
										onChange={() => toggleOne(event.id)}
										onClick={(e) => e.stopPropagation()}
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
											<p className="truncate text-xs text-muted font-mono">
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
									<span className="text-xs text-muted whitespace-nowrap">
										{timeAgo(event.timestamp)}
									</span>
								</DataTableCell>
							</DataTableRow>
						))
					)}
				</DataTableBody>
			</DataTable>

			{/* Detail drawer */}
			<EventDetailDrawer
				event={activeEvent}
				open={drawerOpen}
				onClose={() => setDrawerOpen(false)}
			/>
		</div>
	);
}
