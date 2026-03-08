const statusStyles: Record<string, { dot: string; text: string }> = {
	healthy: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
	running: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
	succeeded: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
	deploying: { dot: "bg-blue-500 pulse-dot", text: "text-blue-600 dark:text-blue-400" },
	queued: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
	provisioning: { dot: "bg-amber-500 pulse-dot", text: "text-amber-600 dark:text-amber-400" },
	degraded: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
	failed: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
	offline: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
	stopped: { dot: "bg-neutral-400", text: "text-muted" },
	exited: { dot: "bg-neutral-400", text: "text-muted" },
	draft: { dot: "bg-neutral-400", text: "text-muted" },
	created: { dot: "bg-neutral-400", text: "text-muted" },
	paused: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
};

const fallback = { dot: "bg-neutral-400", text: "text-muted" };

export function StatusBadge({ status }: { status: string }) {
	const normalized = status.toLowerCase().trim();
	const style = statusStyles[normalized] || fallback;

	return (
		<span className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${style.text}`}>
			<span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
			{status.replaceAll("-", " ")}
		</span>
	);
}
