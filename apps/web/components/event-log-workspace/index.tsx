"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { type EventDetail, EventDetailDrawer } from "@/components/event-detail-drawer";
import { EventLogTable } from "./events-table";
import { EventLogStatsBar } from "./stats-bar";
import type { UnifiedEvent } from "./types";
import { countEventSeverities } from "./utils";

export type { UnifiedEvent } from "./types";

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
			setSelected(new Set(events.map((event) => event.id)));
		}
	}, [allSelected, events]);

	const toggleOne = useCallback((id: string) => {
		setSelected((previous) => {
			const next = new Set(previous);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const handleDeleteSelected = useCallback(() => {
		if (!selected.size) {
			return;
		}

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

	const counts = useMemo(() => countEventSeverities(events), [events]);

	return (
		<div>
			<EventLogStatsBar
				totalCount={events.length}
				counts={counts}
				selectedCount={selected.size}
				isPending={isPending}
				onDeleteSelected={handleDeleteSelected}
				onClearAll={handleClearAll}
			/>

			<EventLogTable
				events={events}
				selected={selected}
				allSelected={allSelected}
				onToggleAll={toggleAll}
				onToggleOne={toggleOne}
				onOpenEvent={handleRowClick}
			/>

			<EventDetailDrawer
				event={activeEvent}
				open={drawerOpen}
				onClose={() => setDrawerOpen(false)}
			/>
		</div>
	);
}
