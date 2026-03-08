const statusStyles: Record<string, { dot: string; text: string }> = {
	healthy: { dot: "bg-success", text: "text-success" },
	running: { dot: "bg-success", text: "text-success" },
	succeeded: { dot: "bg-success", text: "text-success" },
	deploying: { dot: "bg-accent pulse-dot", text: "text-foreground" },
	queued: { dot: "bg-warning", text: "text-warning" },
	provisioning: { dot: "bg-warning pulse-dot", text: "text-warning" },
	degraded: { dot: "bg-warning", text: "text-warning" },
	failed: { dot: "bg-danger", text: "text-danger" },
	offline: { dot: "bg-danger", text: "text-danger" },
	stopped: { dot: "bg-muted", text: "text-muted" },
	exited: { dot: "bg-muted", text: "text-muted" },
	draft: { dot: "bg-muted", text: "text-muted" },
	created: { dot: "bg-muted", text: "text-muted" },
	paused: { dot: "bg-warning", text: "text-warning" },
};

const fallback = { dot: "bg-muted", text: "text-muted" };

export function StatusBadge({ status }: { status: string }) {
	const normalized = status.toLowerCase().trim();
	const style = statusStyles[normalized] || fallback;

	return (
		<span
			className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${style.text}`}
		>
			<span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
			{status.replaceAll("-", " ")}
		</span>
	);
}
