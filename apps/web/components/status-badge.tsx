const statusClassNames: Record<string, string> = {
	healthy: "bg-success/10 text-success border-success/20",
	running: "bg-success/10 text-success border-success/20",
	succeeded: "bg-success/10 text-success border-success/20",
	deploying: "bg-accent/10 text-accent border-accent/20",
	queued: "bg-warning/10 text-warning border-warning/20",
	provisioning: "bg-warning/10 text-warning border-warning/20",
	degraded: "bg-warning/10 text-warning border-warning/20",
	failed: "bg-danger/10 text-danger border-danger/20",
	offline: "bg-danger/10 text-danger border-danger/20",
	stopped: "bg-default/10 text-muted border-default/20",
	draft: "bg-default/10 text-muted border-default/20",
};

export function StatusBadge({ status }: { status: string }) {
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusClassNames[status] || "bg-default/10 text-muted border-default/20"}`}
		>
			{status.replaceAll("-", " ")}
		</span>
	);
}
