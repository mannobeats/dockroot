import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listDeployments } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function ActivityPage() {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const deployments = await listDeployments(session.user.id);

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Operations"
				title="Deployment activity"
				description="Execution history for stack deploy and destroy operations."
			/>
			<div className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
				<div className="space-y-4">
					{deployments.length ? (
						deployments.map((deployment) => (
							<div
								key={deployment.id}
								className="rounded-[24px] border border-default/15 bg-background/60 p-5"
							>
								<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<h2 className="text-lg font-semibold">{deployment.stack.name}</h2>
											<StatusBadge status={deployment.status} />
										</div>
										<p className="mt-1 text-sm text-muted">
											{deployment.environment.name} • {deployment.operation}
										</p>
										<p className="mt-2 font-mono text-xs text-muted">{deployment.version}</p>
									</div>
									<p className="text-sm text-muted">{deployment.createdAt.toLocaleString()}</p>
								</div>
								<p className="mt-3 text-sm text-muted">
									{deployment.summary || "Waiting for execution result."}
								</p>
								{deployment.log ? (
									<pre className="mt-4 max-h-64 overflow-auto rounded-2xl bg-[#050914] p-4 text-xs leading-6 text-white/80">
										{deployment.log}
									</pre>
								) : null}
							</div>
						))
					) : (
						<div className="rounded-[24px] border border-dashed border-default/20 bg-background/60 p-8 text-sm text-muted">
							No deployment activity yet.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
