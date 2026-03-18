import type { EventCounts, UnifiedEvent } from "./types";

export const severityVariant: Record<
	string,
	"success" | "accent" | "warning" | "danger" | "default"
> = {
	success: "success",
	info: "accent",
	warning: "warning",
	error: "danger",
};

export function timeAgo(dateStr: string) {
	const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
	if (seconds < 60) return "less than a minute ago";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days > 1 ? "s" : ""} ago`;
}

export function countEventSeverities(events: UnifiedEvent[]): EventCounts {
	const counts: EventCounts = { info: 0, success: 0, warning: 0, error: 0 };
	for (const event of events) {
		if (event.severity in counts) {
			counts[event.severity as keyof EventCounts] += 1;
		}
	}
	return counts;
}
