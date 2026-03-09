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
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Operations"
				title="Activity"
				description={`${deployments.length} deployment operations`}
			/>

			<div className="space-y-3">
				{deployments.length ? (
					deployments.map((deployment) => (
						<Panel
							key={deployment.id}
							padding="md"
							className="transition-all hover:border-default/20"
						>
							<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div>
									<div className="flex items-center gap-2">
										<h2 className="text-base font-semibold">{deployment.stack.name}</h2>
										<StatusBadge status={deployment.status} />
									</div>
									<p className="mt-1 text-sm text-muted">
										{deployment.environment.name} · {deployment.operation}
									</p>
									<p className="mt-1 font-mono text-xs text-muted">{deployment.version}</p>
								</div>
								<p className="shrink-0 text-xs text-muted">
									{deployment.createdAt.toLocaleString()}
								</p>
							</div>
							<p className="mt-3 text-sm text-muted">
								{deployment.summary || "Awaiting result..."}
							</p>
							{deployment.log ? (
								<LogBlock className="mt-3 max-h-48 p-4">{deployment.log}</LogBlock>
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
