import { Boxes, FolderKanban, PlayCircle, Server } from "lucide-react";
import Link from "next/link";
import { LiveRuntimePanel } from "@/components/live-runtime-panel";
import { MonitoringHealthGrid } from "@/components/monitoring-health-grid";
import { PageHeader } from "@/components/page-header";
import { PrometheusOverview } from "@/components/prometheus-overview";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import {
	getRuntimeSnapshotForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { getDashboardData } from "@/lib/platform";
import { getPrometheusDashboardMetrics, getPrometheusTargetHealth } from "@/lib/prometheus";

export default async function DashboardPage({
	searchParams,
}: {
	searchParams: Promise<{ environment?: string }>;
}) {
	const { session, userId, role } = await requireUserSession();
	const params = await searchParams;
	const includeRuntime = isPrivilegedRole(role);
	const environment = await resolveRuntimeEnvironment(userId, params.environment);

	const [data, runtime, metrics, targets] = await Promise.all([
		getDashboardData(userId, { includeRuntime }),
		includeRuntime ? getRuntimeSnapshotForEnvironment(userId, environment.id) : null,
		includeRuntime && environment.kind === "local" ? getPrometheusDashboardMetrics() : null,
		includeRuntime && environment.kind === "local" ? getPrometheusTargetHealth() : null,
	]);
	const memoryUsed =
		includeRuntime && runtime
			? (runtime.snapshot.host.totalMemoryGb - runtime.snapshot.host.freeMemoryGb).toFixed(1)
			: null;

	const greeting = (() => {
		const hour = new Date().getHours();
		if (hour < 12) return "Good morning";
		if (hour < 17) return "Good afternoon";
		return "Good evening";
	})();

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				title={`${greeting}, ${session.user.name}`}
				description={`${environment.name} environment`}
				actions={
					<>
						<Link
							href="/dashboard/projects"
							className="inline-flex h-9 items-center justify-center rounded-lg border border-default/10 bg-surface px-4 text-sm font-medium transition-colors hover:border-default/20"
						>
							Projects
						</Link>
						<Link
							href="/dashboard/stacks"
							className="inline-flex h-9 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
						>
							Deploy Stack
						</Link>
					</>
				}
			/>

			{/* Stats Grid */}
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Projects"
					value={String(data.projectCount)}
					detail={`${data.stackCount} stacks`}
					icon={FolderKanban}
				/>
				<StatCard
					label="Environments"
					value={String(data.environmentCount)}
					detail="Local & remote"
					icon={Server}
				/>
				<StatCard
					label="Deployments"
					value={String(data.deploymentCount)}
					detail="Total operations"
					icon={PlayCircle}
				/>
				<StatCard
					label="Containers"
					value={includeRuntime && runtime ? String(runtime.snapshot.counts.containers) : "—"}
					detail={
						includeRuntime && runtime
							? `${runtime.snapshot.counts.images} images`
							: "Scoped to workspace"
					}
					icon={Boxes}
				/>
			</div>

			{/* Host Overview + Recent Projects */}
			<div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
				{includeRuntime && runtime ? (
					<div className="rounded-xl border border-default/10 bg-surface p-5">
						<div className="flex items-center justify-between">
							<div>
								<h2 className="text-sm font-semibold">{runtime.snapshot.host.hostname}</h2>
								<p className="mt-0.5 text-xs text-muted">{environment.name}</p>
							</div>
							<StatusBadge status="healthy" />
						</div>
						<div className="mt-4 grid gap-3 sm:grid-cols-3">
							<div className="rounded-lg bg-foreground/[0.02] p-3">
								<p className="text-xs text-muted">Platform</p>
								<p className="mt-1.5 text-sm font-medium">{runtime.snapshot.host.platform}</p>
								<p className="text-xs text-muted">{runtime.snapshot.host.architecture}</p>
							</div>
							<div className="rounded-lg bg-foreground/[0.02] p-3">
								<p className="text-xs text-muted">Resources</p>
								<p className="mt-1.5 text-sm font-medium">{runtime.snapshot.host.cpus} CPU</p>
								<p className="text-xs text-muted">
									{memoryUsed} / {runtime.snapshot.host.totalMemoryGb} GB
								</p>
							</div>
							<div className="rounded-lg bg-foreground/[0.02] p-3">
								<p className="text-xs text-muted">Data directory</p>
								<p className="mt-1.5 break-all text-xs font-medium">{data.dataDir}</p>
							</div>
						</div>
					</div>
				) : (
					<div className="rounded-xl border border-default/10 bg-surface p-5">
						<h2 className="text-sm font-semibold">Workspace overview</h2>
						<p className="mt-2 max-w-lg text-sm text-muted">
							Scoped to owned projects, environments, stacks, and containers. Host telemetry
							restricted to privileged operators.
						</p>
					</div>
				)}

				<div className="rounded-xl border border-default/10 bg-surface p-5">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold">Recent projects</h2>
						<Link
							href="/dashboard/projects"
							className="text-xs font-medium text-muted transition-colors hover:text-foreground"
						>
							View all
						</Link>
					</div>
					<div className="mt-4 space-y-2">
						{data.recentProjects.length ? (
							data.recentProjects.map((project) => (
								<Link
									key={project.id}
									href={`/dashboard/projects/${project.id}`}
									className="block rounded-lg border border-default/10 p-3 transition-all hover:border-default/20 hover:shadow-sm"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="text-sm font-medium">{project.name}</p>
											<p className="mt-0.5 truncate text-xs text-muted">
												{project.description || "No description"}
											</p>
										</div>
										<span className="shrink-0 rounded-md bg-foreground/[0.04] px-2 py-0.5 text-xs font-medium text-muted">
											{project.stacks.length} stacks
										</span>
									</div>
								</Link>
							))
						) : (
							<div className="rounded-lg border border-dashed border-default/10 p-6 text-center text-sm text-muted">
								No projects yet
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Charts */}
			{includeRuntime && metrics ? <PrometheusOverview metrics={metrics} /> : null}
			{includeRuntime && targets ? <MonitoringHealthGrid targets={targets} /> : null}
			{includeRuntime && environment.kind === "local" ? <LiveRuntimePanel /> : null}

			{/* Latest Activity */}
			<div className="rounded-xl border border-default/10 bg-surface p-5">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-semibold">Latest deployments</h2>
					<Link
						href="/dashboard/activity"
						className="text-xs font-medium text-muted transition-colors hover:text-foreground"
					>
						View all
					</Link>
				</div>
				<div className="table-scroll mt-4">
					<table className="min-w-full text-left text-sm">
						<thead>
							<tr className="border-b border-default/10 text-xs text-muted">
								<th className="pb-3 pr-4 font-medium">Stack</th>
								<th className="pb-3 pr-4 font-medium">Environment</th>
								<th className="pb-3 pr-4 font-medium">Version</th>
								<th className="pb-3 font-medium">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/5">
							{data.recentDeployments.length ? (
								data.recentDeployments.map((deployment) => (
									<tr key={deployment.id} className="group">
										<td className="py-3 pr-4 font-medium">{deployment.stack.name}</td>
										<td className="py-3 pr-4 text-muted">{deployment.environment.name}</td>
										<td className="py-3 pr-4 font-mono text-xs text-muted">{deployment.version}</td>
										<td className="py-3">
											<StatusBadge status={deployment.status} />
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={4} className="py-8 text-center text-sm text-muted">
										No deployments yet
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
