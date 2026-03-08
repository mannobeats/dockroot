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
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Operations"
				title="Activity"
				description={`${deployments.length} deployment operations`}
			/>

			<div className="space-y-3">
				{deployments.length ? (
					deployments.map((deployment) => (
						<div
							key={deployment.id}
							className="rounded-xl border border-default/10 bg-surface p-5 transition-all hover:border-default/20"
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
								<pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-[#0a0a0a] p-4 text-xs leading-5 text-white/80">
									{deployment.log}
								</pre>
							) : null}
						</div>
					))
				) : (
					<div className="rounded-xl border border-dashed border-default/10 p-12 text-center text-sm text-muted">
						No deployment activity yet.
					</div>
				)}
			</div>
		</div>
	);
}
