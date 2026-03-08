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

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Overview"
				title={`Good evening, ${session.user.name}`}
				description={`Operate local and remote Docker Compose stacks from one control plane. Current runtime scope: ${environment.name}.`}
				actions={
					<>
						<Link
							href="/dashboard/projects"
							className="inline-flex h-11 items-center justify-center rounded-2xl border border-default/15 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
						>
							View Projects
						</Link>
						<Link
							href="/dashboard/environments"
							className="inline-flex h-11 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
						>
							Add Environment
						</Link>
					</>
				}
			/>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Projects"
					value={String(data.projectCount)}
					detail={`${data.stackCount} total stacks`}
					icon={FolderKanban}
				/>
				<StatCard
					label="Environments"
					value={String(data.environmentCount)}
					detail="Local Docker + remote agents"
					icon={Server}
				/>
				<StatCard
					label="Deployments"
					value={String(data.deploymentCount)}
					detail="Executed through compose-native workflows"
					icon={PlayCircle}
				/>
				<StatCard
					label="Runtime Assets"
					value={includeRuntime && runtime ? String(runtime.snapshot.counts.containers) : "Scoped"}
					detail={
						includeRuntime && runtime
							? `${runtime.snapshot.counts.images} images on ${runtime.snapshot.host.hostname}`
							: "Tenant runtime visibility is limited to owned workloads"
					}
					icon={Boxes}
				/>
			</div>

			<div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
				{includeRuntime && runtime ? (
					<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
									Host overview
								</p>
								<h2 className="mt-2 text-xl font-semibold tracking-tight">
									{runtime.snapshot.host.hostname}
								</h2>
								<p className="mt-1 text-sm text-muted">{environment.name}</p>
							</div>
							<StatusBadge status="healthy" />
						</div>
						<div className="mt-6 grid gap-4 md:grid-cols-3">
							<div className="rounded-2xl border border-default/15 bg-background/70 p-4">
								<p className="text-xs font-medium text-muted">Platform</p>
								<p className="mt-2 text-lg font-semibold">{runtime.snapshot.host.platform}</p>
								<p className="mt-1 text-sm text-muted">{runtime.snapshot.host.architecture}</p>
							</div>
							<div className="rounded-2xl border border-default/15 bg-background/70 p-4">
								<p className="text-xs font-medium text-muted">Resources</p>
								<p className="mt-2 text-lg font-semibold">
									{runtime.snapshot.host.cpus} CPU threads
								</p>
								<p className="mt-1 text-sm text-muted">
									{memoryUsed} GB used of {runtime.snapshot.host.totalMemoryGb} GB RAM
								</p>
							</div>
							<div className="rounded-2xl border border-default/15 bg-background/70 p-4">
								<p className="text-xs font-medium text-muted">Data directory</p>
								<p className="mt-2 break-all text-sm font-medium">{data.dataDir}</p>
								<p className="mt-1 text-sm text-muted">Compose payloads and runtime artifacts</p>
							</div>
						</div>
					</section>
				) : (
					<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
						<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
							Tenant scope
						</p>
						<h2 className="mt-2 text-xl font-semibold tracking-tight">Workspace overview</h2>
						<p className="mt-4 max-w-2xl text-sm text-muted">
							This account is scoped to owned projects, environments, stacks, deployments, and
							runtime containers. Host-level telemetry and engine administration remain restricted
							to privileged operators.
						</p>
					</section>
				)}

				<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
					<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
						Recent projects
					</p>
					<div className="mt-4 space-y-3">
						{data.recentProjects.length ? (
							data.recentProjects.map((project) => (
								<Link
									key={project.id}
									href={`/dashboard/projects/${project.id}`}
									className="block rounded-2xl border border-default/15 bg-background/70 p-4 transition-colors hover:border-accent/30"
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="text-sm font-semibold">{project.name}</p>
											<p className="mt-1 text-sm text-muted">
												{project.description || "No project description yet."}
											</p>
										</div>
										<span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
											{project.stacks.length} stacks
										</span>
									</div>
								</Link>
							))
						) : (
							<div className="rounded-2xl border border-dashed border-default/20 bg-background/60 p-6 text-sm text-muted">
								Create your first project to start organizing stacks.
							</div>
						)}
					</div>
				</section>
			</div>

			{includeRuntime && metrics ? <PrometheusOverview metrics={metrics} /> : null}

			{includeRuntime && targets ? <MonitoringHealthGrid targets={targets} /> : null}

			{includeRuntime && environment.kind === "local" ? <LiveRuntimePanel /> : null}

			<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
							Deployments
						</p>
						<h2 className="mt-2 text-xl font-semibold tracking-tight">Latest activity</h2>
					</div>
					<Link href="/dashboard/activity" className="text-sm font-medium text-accent">
						View all
					</Link>
				</div>
				<div className="mt-5 overflow-hidden rounded-[22px] border border-default/15">
					<table className="min-w-full divide-y divide-default/15 text-left">
						<thead className="bg-background/60 text-[11px] uppercase tracking-[0.18em] text-muted">
							<tr>
								<th className="px-4 py-3 font-medium">Stack</th>
								<th className="px-4 py-3 font-medium">Environment</th>
								<th className="px-4 py-3 font-medium">Version</th>
								<th className="px-4 py-3 font-medium">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/10 bg-surface/40 text-sm">
							{data.recentDeployments.length ? (
								data.recentDeployments.map((deployment) => (
									<tr key={deployment.id}>
										<td className="px-4 py-3">
											<div className="font-medium">{deployment.stack.name}</div>
										</td>
										<td className="px-4 py-3 text-muted">{deployment.environment.name}</td>
										<td className="px-4 py-3 font-mono text-xs text-muted">{deployment.version}</td>
										<td className="px-4 py-3">
											<StatusBadge status={deployment.status} />
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
										No deployments yet. Create a stack from a project and deploy it.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
