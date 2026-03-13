import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LogBlock } from "@/components/ui/log-block";
import { Panel } from "@/components/ui/panel";
import { listDeployments } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function ActivityPage() {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const deployments = await listDeployments(session.user.id);

	return (
		<div className="animate-in space-y-5">
			<PageHeader title="Activity" description={`${deployments.length} deployments`} />

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
		</div>
	);
}
