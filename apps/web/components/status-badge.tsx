const statusStyles: Record<string, { dot: string; text: string }> = {
	healthy: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
	running: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
	succeeded: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
	deploying: { dot: "bg-blue-500 pulse-dot", text: "text-blue-700 dark:text-blue-400" },
	queued: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
	provisioning: { dot: "bg-amber-500 pulse-dot", text: "text-amber-700 dark:text-amber-400" },
	degraded: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
	failed: { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-400" },
	offline: { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-400" },
	stopped: { dot: "bg-gray-400 dark:bg-gray-500", text: "text-gray-600 dark:text-gray-400" },
	exited: { dot: "bg-gray-400 dark:bg-gray-500", text: "text-gray-600 dark:text-gray-400" },
	draft: { dot: "bg-gray-400 dark:bg-gray-500", text: "text-gray-600 dark:text-gray-400" },
	created: { dot: "bg-gray-400 dark:bg-gray-500", text: "text-gray-600 dark:text-gray-400" },
	paused: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
};

const fallback = { dot: "bg-gray-400 dark:bg-gray-500", text: "text-gray-600 dark:text-gray-400" };

export function StatusBadge({ status }: { status: string }) {
	const normalized = status.toLowerCase().trim();
	const style = statusStyles[normalized] || fallback;

	return (
		<span className={`inline-flex items-center gap-1.5 text-[11px] font-medium capitalize ${style.text}`}>
			<span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
			{status.replaceAll("-", " ")}
		</span>
	);
}
