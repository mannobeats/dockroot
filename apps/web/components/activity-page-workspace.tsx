"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { EventLogWorkspace, type UnifiedEvent } from "@/components/event-log-workspace";
import { InstantFilterToolbar } from "@/components/instant-filter-toolbar";
import { Panel } from "@/components/ui/panel";
import { matchesSearchQuery } from "@/lib/search";

export function ActivityPageWorkspace({
	events,
	deleteAction,
	clearAllAction,
	initialQuery = "",
	initialSeverity = "all",
}: {
	events: UnifiedEvent[];
	deleteAction: (formData: FormData) => Promise<unknown>;
	clearAllAction: () => Promise<unknown>;
	initialQuery?: string;
	initialSeverity?: string;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [severity, setSeverity] = useState(initialSeverity);
	const [kind, setKind] = useState("all");
	const deferredQuery = useDeferredValue(query);

	const filteredEvents = useMemo(
		() =>
			events.filter((event) => {
				const matchesSeverity = severity === "all" || event.severity === severity;
				const matchesKind = kind === "all" || event.kind === kind;
				return (
					matchesSeverity &&
					matchesKind &&
					matchesSearchQuery(
						deferredQuery,
						event.actionType,
						event.resourceName,
						event.environmentName,
						event.containerId,
						event.details,
						event.userName,
						event.source,
						event.meta,
					)
				);
			}),
		[deferredQuery, events, kind, severity],
	);

	return (
		<Panel>
			<InstantFilterToolbar
				searchId="activity-list-search"
				searchPlaceholder="Search activity by action, resource, environment, user, or detail"
				query={query}
				onQueryChange={setQuery}
				resultCount={filteredEvents.length}
				totalCount={events.length}
				onReset={() => {
					setQuery("");
					setSeverity("all");
					setKind("all");
				}}
				filters={[
					{
						id: "activity-kind-filter",
						value: kind,
						onChange: setKind,
						className: "h-7 min-w-36 text-xs",
						options: [
							{ value: "all", label: "All sources" },
							{ value: "deployment", label: "Deployments" },
							{ value: "runtime", label: "Runtime actions" },
						],
					},
					{
						id: "activity-severity-filter",
						value: severity,
						onChange: setSeverity,
						className: "h-7 min-w-32 text-xs",
						options: [
							{ value: "all", label: "All severities" },
							{ value: "info", label: "Info" },
							{ value: "success", label: "Success" },
							{ value: "warning", label: "Warning" },
							{ value: "error", label: "Error" },
						],
					},
				]}
			/>
			<EventLogWorkspace
				events={filteredEvents}
				deleteAction={deleteAction}
				clearAllAction={clearAllAction}
			/>
		</Panel>
	);
}
