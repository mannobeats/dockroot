import { Boxes, Layers3, PlayCircle, Server } from "lucide-react";
import Link from "next/link";
import { LiveRuntimePanel } from "@/components/live-runtime-panel";
import { MonitoringHealthGrid } from "@/components/monitoring-health-grid";
import { PageHeader } from "@/components/page-header";
import { PrometheusOverview } from "@/components/prometheus-overview";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { UtilizationBar } from "@/components/ui/utilization-bar";
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
	const hostTotalMemoryGb = includeRuntime && runtime ? runtime.snapshot.host.totalMemoryGb : null;
	const fallbackUsedMemoryGb =
		includeRuntime && runtime
			? runtime.snapshot.host.totalMemoryGb - runtime.snapshot.host.freeMemoryGb
			: null;
	const prometheusMemoryPercent = metrics?.memoryPercent ?? null;
	const memoryUsedPercent =
		hostTotalMemoryGb !== null
			? Number(
					(
						prometheusMemoryPercent ??
						((fallbackUsedMemoryGb || 0) / Math.max(hostTotalMemoryGb, 1)) * 100
					).toFixed(1),
				)
			: null;
	const memoryUsed =
		hostTotalMemoryGb !== null && memoryUsedPercent !== null
			? Number(((hostTotalMemoryGb * memoryUsedPercent) / 100).toFixed(1))
			: null;

	const greeting = (() => {
		const hour = new Date().getHours();
		if (hour < 12) return "Good morning";
		if (hour < 17) return "Good afternoon";
		return "Good evening";
	})();

	return (
		<div className="animate-in space-y-8">
			<PageHeader
				title={`${greeting}, ${session.user.name}`}
				description={`${environment.name} environment`}
				actions={
					<>
						<LinkButton
							href={`/dashboard/stacks?environment=${environment.id}`}
							variant="secondary"
						>
							Stacks
						</LinkButton>
						<LinkButton href={`/dashboard/stacks?environment=${environment.id}`}>
							Deploy Stack
						</LinkButton>
					</>
				}
			/>

			{/* Stats Grid */}
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					label="Stacks"
					value={String(data.stackCount)}
					detail="Tracked workspaces"
					icon={Layers3}
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

			{/* Host Overview + Recent stacks */}
			<div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
				{includeRuntime && runtime ? (
					<Panel padding="lg">
						<div className="flex items-center justify-between">
							<div>
								<h2 className="text-sm font-semibold tracking-tight">{runtime.snapshot.host.hostname}</h2>
								<p className="mt-0.5 text-xs text-muted">{environment.name}</p>
							</div>
							<StatusBadge status="healthy" />
						</div>
						<div className="mt-5 grid gap-3 sm:grid-cols-3">
							<div className="rounded-xl bg-foreground/[0.02] p-4">
								<p className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">Platform</p>
								<p className="mt-2 text-sm font-semibold">{runtime.snapshot.host.platform}</p>
								<p className="text-xs text-muted">{runtime.snapshot.host.architecture}</p>
							</div>
							<div className="rounded-xl bg-foreground/[0.02] p-4">
								<p className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">Resources</p>
								<p className="mt-2 text-sm font-semibold">{runtime.snapshot.host.cpus} CPU</p>
								<p className="text-xs text-muted">
									{memoryUsed ?? "—"} / {runtime.snapshot.host.totalMemoryGb} GB
								</p>
								<div className="mt-3">
									<UtilizationBar
										label="Memory usage"
										percent={memoryUsedPercent ?? 0}
										valueLabel={`${memoryUsedPercent ?? 0}%`}
									/>
								</div>
							</div>
							<div className="rounded-xl bg-foreground/[0.02] p-4">
								<p className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">Data directory</p>
								<p className="mt-2 break-all text-xs font-medium">{data.dataDir}</p>
							</div>
						</div>
					</Panel>
				) : (
					<Panel padding="lg">
						<h2 className="text-sm font-semibold tracking-tight">Workspace overview</h2>
						<p className="mt-2 max-w-lg text-sm text-muted">
							Scoped to owned environments, stacks, and containers. Host telemetry restricted to
							privileged operators.
						</p>
					</Panel>
				)}

				<Panel padding="lg">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold tracking-tight">Recent stacks</h2>
						<Link
							href={`/dashboard/stacks?environment=${environment.id}`}
							className="text-xs font-medium text-accent transition-colors hover:text-accent/80"
						>
							View all
						</Link>
					</div>
					<div className="mt-4 space-y-2">
						{data.recentStacks.length ? (
							data.recentStacks.map((stack) => (
								<Link
									key={stack.id}
									href={`/dashboard/stacks/${stack.id}`}
									className="block rounded-xl border border-default/8 p-3.5 transition-all duration-200 hover:border-default/20 hover:shadow-[var(--shadow-sm)] hover:-translate-y-px"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="text-sm font-medium">{stack.name}</p>
											<p className="mt-0.5 truncate text-xs text-muted">
												{stack.description || stack.environment.name}
											</p>
										</div>
										<Badge className="shrink-0">{stack.environment.name}</Badge>
									</div>
								</Link>
							))
						) : (
							<EmptyState title="No stacks yet" className="p-6" />
						)}
					</div>
				</Panel>
			</div>

			{/* Charts */}
			{includeRuntime && metrics ? <PrometheusOverview metrics={metrics} /> : null}
			{includeRuntime && targets ? <MonitoringHealthGrid targets={targets} /> : null}
			{includeRuntime && environment.kind === "local" ? <LiveRuntimePanel /> : null}

			{/* Latest Activity */}
			<Panel>
				<div className="px-5 py-4">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold tracking-tight">Latest deployments</h2>
						<Link
							href={`/dashboard/activity?environment=${environment.id}`}
							className="text-xs font-medium text-accent transition-colors hover:text-accent/80"
						>
							View all
						</Link>
					</div>
				</div>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Stack</DataTableHead>
							<DataTableHead>Environment</DataTableHead>
							<DataTableHead>Version</DataTableHead>
							<DataTableHead>Status</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{data.recentDeployments.length ? (
							data.recentDeployments.map((deployment) => (
								<DataTableRow key={deployment.id} className="group">
									<DataTableCell className="font-medium">
										{deployment.stack.name}
									</DataTableCell>
									<DataTableCell className="text-muted">
										{deployment.environment.name}
									</DataTableCell>
									<DataTableCell className="font-mono text-xs text-muted">
										{deployment.version}
									</DataTableCell>
									<DataTableCell>
										<StatusBadge status={deployment.status} />
									</DataTableCell>
								</DataTableRow>
							))
						) : (
							<DataTableEmpty colSpan={4}>No deployments yet</DataTableEmpty>
						)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
