import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LogBlock } from "@/components/ui/log-block";
import { Panel } from "@/components/ui/panel";
import { listDeployments, listRuntimeActions } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function ActivityPage() {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const deployments = await listDeployments(session.user.id);
	const runtimeActions = await listRuntimeActions(session.user.id, 120);

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Activity"
				description={`${deployments.length} deployments · ${runtimeActions.length} runtime actions`}
			/>

			<div className="space-y-2">
				{deployments.length ? (
					deployments.map((deployment) => (
						<Panel
							key={deployment.id}
							padding="sm"
							className="transition-colors hover:border-default/20"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<h2 className="text-sm font-semibold">{deployment.stack.name}</h2>
										<StatusBadge status={deployment.status} />
									</div>
									<p className="mt-0.5 text-xs text-muted">
										{deployment.environment.name} · {deployment.operation} ·{" "}
										<span className="font-mono">{deployment.version}</span>
									</p>
								</div>
								<p className="shrink-0 text-[11px] text-muted">
									{deployment.createdAt.toLocaleString()}
								</p>
							</div>
							{deployment.summary ? (
								<p className="mt-2 text-sm text-muted">{deployment.summary}</p>
							) : null}
							{deployment.log ? (
								<LogBlock className="mt-2 max-h-40 p-3">{deployment.log}</LogBlock>
							) : null}
						</Panel>
					))
				) : (
					<EmptyState title="No deployment activity yet" />
				)}
			</div>

			<Panel padding="sm">
				<div className="mb-3 flex items-center justify-between">
					<h2 className="text-sm font-semibold">Runtime actions</h2>
					<p className="text-[11px] text-muted">Latest socket/terminal/log operations</p>
				</div>
				{runtimeActions.length ? (
					<div className="space-y-2">
						{runtimeActions.map((event) => (
							<div
								key={event.id}
								className="rounded-lg border border-default/10 bg-surface-2 px-3 py-2.5"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<p className="text-xs font-semibold">{event.actionType}</p>
											<StatusBadge
												status={
													event.status === "error"
														? "failed"
														: event.status === "warning"
															? "queued"
															: "running"
												}
											/>
										</div>
										<p className="mt-0.5 text-[11px] text-muted">
											{event.environment?.name || "No environment"} · {event.source}
											{event.containerId ? ` · ${event.containerId}` : ""}
										</p>
									</div>
									<p className="shrink-0 text-[11px] text-muted">
										{event.occurredAt.toLocaleString()}
									</p>
								</div>
							</div>
						))}
					</div>
				) : (
					<EmptyState title="No runtime actions yet" />
				)}
			</Panel>
		</div>
	);
}
