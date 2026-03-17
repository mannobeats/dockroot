import { Boxes, Layers3, PlayCircle, Server } from "lucide-react";
import Link from "next/link";
import { MonitoringHealthPanel } from "@/components/monitoring-health-panel";
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
import { getMonitoringCollectorHealth, getPrometheusDashboardMetrics } from "@/lib/prometheus";

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
		includeRuntime && environment.kind === "local" ? getMonitoringCollectorHealth() : null,
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
	const deploymentAlerts = data.recentDeployments.filter((deployment) =>
		["failed", "queued", "deploying"].includes(deployment.status),
	);
	const collectorAlerts = (targets || []).filter((collector) => collector.status !== "healthy");
	const environmentAlerts =
		metrics?.environmentStatus.filter(
			(entry) => ["degraded", "offline", "down"].includes(entry.label) && entry.value > 0,
		) || [];
	const attentionItems = [
		...deploymentAlerts.slice(0, 3).map((deployment) => ({
			id: deployment.id,
			title: deployment.stack.name,
			detail: `${deployment.status} · ${deployment.environment.name}`,
			status: deployment.status,
		})),
		...collectorAlerts.slice(0, 2).map((collector) => ({
			id: collector.name,
			title: collector.name,
			detail: collector.lastError || "Monitoring collector needs attention",
			status: collector.status,
		})),
		...environmentAlerts.slice(0, 2).map((entry) => ({
			id: entry.label,
			title: `${entry.value} environment${entry.value === 1 ? "" : "s"}`,
			detail: `${entry.label} status detected`,
			status: entry.label,
		})),
	].slice(0, 4);

	return (
		<div className="animate-in space-y-6">
			{/* Greeting + quick action */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<h1 className="break-words text-lg font-bold tracking-tight [overflow-wrap:anywhere]">
						{greeting}, {session.user.name}
					</h1>
					<p className="break-words text-sm text-muted [overflow-wrap:anywhere]">
						{environment.name}
					</p>
				</div>
				<LinkButton
					href={`/dashboard/stacks?environment=${environment.id}`}
					size="sm"
					className="self-start"
				>
					Deploy Stack
				</LinkButton>
			</div>

			{/* Compact stats row */}
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard label="Stacks" value={String(data.stackCount)} detail="tracked" icon={Layers3} />
				<StatCard
					label="Environments"
					value={String(data.environmentCount)}
					detail="local & remote"
					icon={Server}
				/>
				<StatCard
					label="Deployments"
					value={String(data.deploymentCount)}
					detail="total"
					icon={PlayCircle}
				/>
				<StatCard
					label="Containers"
					value={includeRuntime && runtime ? String(runtime.snapshot.counts.containers) : "—"}
					detail={
						includeRuntime && runtime
							? `${runtime.snapshot.counts.images} images`
							: "scoped to workspace"
					}
					icon={Boxes}
				/>
			</div>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
				<div className="min-w-0 space-y-4">
					{includeRuntime && metrics ? <PrometheusOverview metrics={metrics} /> : null}
					{includeRuntime && targets ? <MonitoringHealthPanel collectors={targets} /> : null}
				</div>

				<div className="space-y-4">
					<Panel padding="md" className="min-w-0">
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-xs font-medium text-muted">Needs Attention</p>
								<h2 className="mt-1 text-sm font-semibold">
									{attentionItems.length
										? `${attentionItems.length} item${attentionItems.length === 1 ? "" : "s"} need review`
										: "No urgent issues detected"}
								</h2>
							</div>
							<Badge variant={attentionItems.length ? "warning" : "success"}>
								{attentionItems.length || "Stable"}
							</Badge>
						</div>
						<div className="mt-4 space-y-2">
							{attentionItems.length ? (
								attentionItems.map((item) => (
									<div
										key={item.id}
										className="flex items-start justify-between gap-3 rounded-xl border border-default/10 bg-surface px-3 py-3"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium">{item.title}</p>
											<p className="mt-1 break-words text-[11px] text-muted [overflow-wrap:anywhere]">
												{item.detail}
											</p>
										</div>
										<div className="shrink-0 pt-0.5">
											<StatusBadge status={item.status} />
										</div>
									</div>
								))
							) : (
								<EmptyState
									title="Everything looks stable"
									description="No failed deployments, degraded collectors, or unhealthy environments are currently visible."
									className="border-default/10 bg-surface-raised p-4"
								/>
							)}
						</div>
					</Panel>

					<Panel padding="md" className="min-w-0">
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-xs font-medium text-muted">Recent Deployments</p>
								<h2 className="mt-1 text-sm font-semibold">What changed most recently</h2>
							</div>
							<Link
								href={`/dashboard/activity?environment=${environment.id}`}
								className="text-xs font-medium text-accent hover:text-accent/80"
							>
								View all
							</Link>
						</div>
						<div className="mt-4 space-y-2">
							{data.recentDeployments.length ? (
								data.recentDeployments.slice(0, 5).map((deployment) => (
									<div
										key={deployment.id}
										className="rounded-xl border border-default/10 bg-surface px-3 py-3"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium">{deployment.stack.name}</p>
												<p className="mt-1 text-[11px] text-muted">
													{deployment.environment.name} ·{" "}
													<span className="font-mono">{deployment.version}</span>
												</p>
											</div>
											<div className="shrink-0 pt-0.5">
												<StatusBadge status={deployment.status} />
											</div>
										</div>
										<p className="mt-2 text-[11px] text-muted">
											{deployment.createdAt.toLocaleString()}
										</p>
									</div>
								))
							) : (
								<EmptyState
									title="No deployments yet"
									description="Tracked stack deployments will appear here."
									className="border-default/10 bg-surface-raised p-4"
								/>
							)}
						</div>
					</Panel>
				</div>
			</div>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
				{includeRuntime && runtime ? (
					<Panel padding="md" className="min-w-0">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="text-xs font-medium text-muted">Runtime Host</p>
								<h2 className="mt-1 break-words text-sm font-semibold [overflow-wrap:anywhere]">
									{runtime.snapshot.host.hostname}
								</h2>
								<p className="mt-1 text-xs text-muted">
									{runtime.snapshot.host.platform} · {runtime.snapshot.host.architecture} ·{" "}
									{runtime.snapshot.host.cpus} CPU
								</p>
							</div>
							<StatusBadge status="healthy" />
						</div>
						<div className="mt-4 grid gap-3 sm:grid-cols-2">
							<UtilizationBar
								label="Memory"
								percent={memoryUsedPercent ?? 0}
								valueLabel={`${memoryUsed ?? "—"} / ${runtime.snapshot.host.totalMemoryGb} GB`}
							/>
							<div className="min-w-0 text-xs text-muted">
								<p className="font-medium text-foreground">Data Directory</p>
								<p className="mt-1 break-all">{data.dataDir}</p>
							</div>
						</div>
					</Panel>
				) : (
					<Panel padding="md" className="min-w-0">
						<p className="text-xs font-medium text-muted">Workspace Overview</p>
						<h2 className="mt-1 text-sm font-semibold">Operator telemetry is unavailable here</h2>
						<p className="mt-2 text-sm text-muted">
							Host-level telemetry appears only for privileged users on local runtime environments.
						</p>
					</Panel>
				)}

				<Panel padding="md" className="min-w-0">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-xs font-medium text-muted">Recent Stacks</p>
							<h2 className="mt-1 text-sm font-semibold">The stacks you touched most recently</h2>
						</div>
						<Link
							href={`/dashboard/stacks?environment=${environment.id}`}
							className="text-xs font-medium text-accent hover:text-accent/80"
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
									className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-default/10 bg-surface px-3 py-3 transition-colors hover:border-default/18 hover:bg-foreground/[0.02]"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{stack.name}</p>
										<p className="mt-1 truncate text-xs text-muted">
											{stack.description || stack.environment.name}
										</p>
									</div>
									<Badge className="shrink-0">{stack.environment.name}</Badge>
								</Link>
							))
						) : (
							<EmptyState
								title="No stacks yet"
								description="Create a stack to start tracking deployments and runtime health."
								className="border-default/10 bg-surface-raised p-4"
							/>
						)}
					</div>
				</Panel>
			</div>

			<Panel className="min-w-0">
				<div className="flex items-center justify-between gap-3 px-3 py-2.5">
					<h2 className="text-sm font-semibold">Deployment Ledger</h2>
					<Link
						href={`/dashboard/activity?environment=${environment.id}`}
						className="text-xs font-medium text-accent hover:text-accent/80"
					>
						View all
					</Link>
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
								<DataTableRow key={deployment.id}>
									<DataTableCell className="max-w-[260px] truncate font-medium">
										{deployment.stack.name}
									</DataTableCell>
									<DataTableCell className="max-w-[220px] truncate text-muted">
										{deployment.environment.name}
									</DataTableCell>
									<DataTableCell className="max-w-[200px] truncate font-mono text-xs text-muted">
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
