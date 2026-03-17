import { AlertTriangle, Boxes, Layers3, PlayCircle, Server } from "lucide-react";
import Link from "next/link";
import { DashboardStatusPanel } from "@/components/dashboard-status-panel";
import { InfrastructureCharts } from "@/components/infrastructure-charts";
import { RuntimeUnavailablePanel } from "@/components/runtime-unavailable-panel";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { Panel, PanelContent, PanelHeader } from "@/components/ui/panel";
import { UtilizationBar } from "@/components/ui/utilization-bar";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import {
	getRuntimeConnectionMessage,
	getRuntimeSnapshotForEnvironment,
	isRuntimeConnectionError,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { getDashboardData } from "@/lib/platform";
import { getEnvironmentMetricsSeries, getRuntimeCollectorHealth } from "@/lib/runtime-metrics";

export default async function DashboardPage({
	searchParams,
}: {
	searchParams: Promise<{ environment?: string }>;
}) {
	const { session, userId, role } = await requireUserSession();
	const params = await searchParams;
	const includeRuntime = isPrivilegedRole(role);
	const environment = await resolveRuntimeEnvironment(userId, params.environment);
	let runtimeIssue: string | null = null;
	const [data, runtimeResult, metrics, targets] = await Promise.all([
		getDashboardData(userId, { includeRuntime }),
		includeRuntime
			? getRuntimeSnapshotForEnvironment(userId, environment.id).catch((error) => {
					if (isRuntimeConnectionError(error)) {
						runtimeIssue = getRuntimeConnectionMessage(error);
						return null;
					}
					throw error;
				})
			: null,
		includeRuntime ? getEnvironmentMetricsSeries(environment.id) : null,
		includeRuntime ? getRuntimeCollectorHealth(environment) : null,
	]);
	const runtime = runtimeResult;
	const dashboardMetrics = metrics?.available
		? metrics
		: includeRuntime && runtime
			? {
					available: true,
					cpuPercent: runtime.snapshot.usage?.cpuPercent ?? null,
					memoryPercent: runtime.snapshot.usage?.memoryPercent ?? null,
					cpuSeries: [
						{
							time: new Date().toLocaleTimeString([], {
								hour: "numeric",
								minute: "2-digit",
							}),
							value: runtime.snapshot.usage?.cpuPercent ?? 0,
						},
					],
					memorySeries: [
						{
							time: new Date().toLocaleTimeString([], {
								hour: "numeric",
								minute: "2-digit",
							}),
							value: runtime.snapshot.usage?.memoryPercent ?? 0,
						},
					],
					runningContainers: runtime.snapshot.counts.containers,
					containerCount: runtime.snapshot.counts.containers,
					imageCount: runtime.snapshot.counts.images,
					memoryUsedBytes: null,
					memoryTotalBytes: null,
				}
			: null;
	const collectorHealth = targets || null;
	const deploymentStatus = data.recentDeployments
		.filter(
			(deployment) =>
				deployment.environment?.id === environment.id ||
				deployment.environmentId === environment.id,
		)
		.reduce<Array<{ label: string; value: number }>>((acc, deployment) => {
			const entry = acc.find((item) => item.label === deployment.status);
			if (entry) {
				entry.value += 1;
			} else {
				acc.push({ label: deployment.status, value: 1 });
			}
			return acc;
		}, []);
	const environmentStatus = [{ label: environment.status, value: 1 }];
	const hostTotalMemoryGb = includeRuntime && runtime ? runtime.snapshot.host.totalMemoryGb : null;
	const fallbackUsedMemoryGb =
		includeRuntime && runtime
			? runtime.snapshot.host.totalMemoryGb - runtime.snapshot.host.freeMemoryGb
			: null;
	const nativeMemoryPercent = dashboardMetrics?.memoryPercent ?? null;
	const memoryUsedPercent =
		hostTotalMemoryGb !== null
			? Number(
					(
						nativeMemoryPercent ??
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
	const collectorAlerts = (collectorHealth || []).filter(
		(collector) => collector.status !== "healthy",
	);
	const environmentAlerts = ["degraded", "offline"].includes(environment.status)
		? [{ label: environment.status, value: 1 }]
		: [];
	const attentionItems = [
		...deploymentAlerts.slice(0, 3).map((deployment) => ({
			id: deployment.id,
			title: deployment.stackName || deployment.stack?.name || "Unknown stack",
			detail: `${deployment.status} · ${deployment.environmentName || deployment.environment?.name || "Unknown"}`,
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

	const activityLink = `/dashboard/activity?environment=${environment.id}`;

	// Serialize deployment dates for client component
	const serializedDeployments = data.recentDeployments.map((d) => ({
		id: d.id,
		status: d.status,
		version: d.version,
		createdAt: d.createdAt.toISOString(),
		stack: d.stack
			? { id: d.stack.id, name: d.stack.name }
			: { id: "", name: d.stackName || "Deleted stack" },
		environment: d.environment
			? { id: d.environment.id, name: d.environment.name }
			: { id: "", name: d.environmentName || "Deleted environment" },
	}));

	const containerCount = includeRuntime && runtime ? runtime.snapshot.counts.containers : null;
	const imageCount = includeRuntime && runtime ? runtime.snapshot.counts.images : null;

	return (
		<div className="animate-in space-y-5">
			{/* Row 1: Header */}
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

			{/* Row 2: Attention banner — only when issues exist */}
			{attentionItems.length > 0 ? (
				<div className="rounded-lg border border-warning/15 bg-warning/[0.04] px-4 py-3">
					<div className="flex items-center gap-2 text-xs font-medium text-warning">
						<AlertTriangle className="h-3.5 w-3.5" />
						<span>
							{attentionItems.length} item{attentionItems.length === 1 ? "" : "s"} need
							{attentionItems.length === 1 ? "s" : ""} attention
						</span>
					</div>
					<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
						{attentionItems.map((item) => (
							<div key={item.id} className="flex items-center gap-2 text-xs">
								<StatusBadge status={item.status} />
								<span className="font-medium">{item.title}</span>
								<span className="text-muted">{item.detail}</span>
							</div>
						))}
					</div>
				</div>
			) : null}

			{runtimeIssue ? (
				<RuntimeUnavailablePanel
					title={`${environment.name} is not ready yet`}
					message={runtimeIssue}
				/>
			) : null}

			{/* Row 3: Metrics strip */}
			<div className="flex flex-wrap items-center divide-x divide-default/10">
				<MetricInline
					icon={<Layers3 className="h-3.5 w-3.5 text-muted" />}
					value={String(data.stackCount)}
					label="Stacks"
					first
				/>
				<MetricInline
					icon={<Server className="h-3.5 w-3.5 text-muted" />}
					value={String(data.environmentCount)}
					label="Environments"
				/>
				<MetricInline
					icon={<PlayCircle className="h-3.5 w-3.5 text-muted" />}
					value={String(data.deploymentCount)}
					label="Deployments"
				/>
				<MetricInline
					icon={<Boxes className="h-3.5 w-3.5 text-muted" />}
					value={containerCount !== null ? String(containerCount) : "—"}
					label={imageCount !== null ? `${imageCount} images` : "Containers"}
				/>
			</div>

			{/* Row 4: Two-column main content */}
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
				{/* Left: Infrastructure */}
				{includeRuntime && dashboardMetrics ? (
					<Panel className="min-w-0">
						<PanelHeader>
							<div className="min-w-0">
								<p className="text-xs font-medium text-muted">Infrastructure</p>
								<div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
									<span className="text-xs text-muted">
										CPU{" "}
										<span className="font-mono text-sm font-semibold text-foreground">
											{dashboardMetrics.cpuPercent?.toFixed(1) ?? "—"}%
										</span>
									</span>
									<span className="text-xs text-muted">
										Memory{" "}
										<span className="font-mono text-sm font-semibold text-foreground">
											{dashboardMetrics.memoryPercent?.toFixed(1) ?? "—"}%
										</span>
									</span>
									<span className="text-xs text-muted">
										Containers{" "}
										<span className="font-mono text-sm font-semibold text-foreground">
											{dashboardMetrics.runningContainers ?? 0}
										</span>
									</span>
								</div>
							</div>
							{runtime ? (
								<div className="hidden shrink-0 text-right sm:block">
									<p className="text-[11px] text-muted">{runtime.snapshot.host.hostname}</p>
									<p className="text-[10px] text-muted/70">
										{runtime.snapshot.host.platform} · {runtime.snapshot.host.architecture} ·{" "}
										{runtime.snapshot.host.cpus} CPU
									</p>
								</div>
							) : null}
						</PanelHeader>
						<PanelContent>
							<InfrastructureCharts metrics={dashboardMetrics} />

							{runtime && hostTotalMemoryGb !== null ? (
								<div className="mt-4 flex flex-col gap-3 border-t border-default/8 pt-4 sm:flex-row sm:items-end sm:justify-between">
									<div className="min-w-0 flex-1 sm:max-w-xs">
										<UtilizationBar
											label="Memory"
											percent={memoryUsedPercent ?? 0}
											valueLabel={`${memoryUsed ?? "—"} / ${hostTotalMemoryGb} GB`}
										/>
									</div>
									<p className="truncate text-[10px] text-muted/60">{data.dataDir}</p>
								</div>
							) : null}
						</PanelContent>
					</Panel>
				) : (
					<Panel padding="md" className="min-w-0">
						<p className="text-xs font-medium text-muted">Infrastructure</p>
						<p className="mt-1 text-sm font-semibold">Telemetry unavailable</p>
						<p className="mt-2 text-xs text-muted">
							Host-level telemetry appears only for privileged users on local runtime environments.
						</p>
					</Panel>
				)}

				{/* Right: Status & Activity tabs */}
				<DashboardStatusPanel
					recentDeployments={serializedDeployments}
					deploymentStatus={deploymentStatus}
					environmentStatus={environmentStatus}
					collectors={collectorHealth}
					activityLink={activityLink}
				/>
			</div>

			{/* Row 5: Recent Stacks */}
			{data.recentStacks.length > 0 ? (
				<div>
					<div className="mb-2.5 flex items-center justify-between">
						<p className="text-xs font-medium text-muted">Recent Stacks</p>
						<Link
							href={`/dashboard/stacks?environment=${environment.id}`}
							className="text-xs font-medium text-accent hover:text-accent/80"
						>
							View all
						</Link>
					</div>
					<div className="flex gap-3 overflow-x-auto pb-1">
						{data.recentStacks.map((stack) => (
							<Link
								key={stack.id}
								href={`/dashboard/stacks/${stack.id}`}
								className="flex min-w-0 shrink-0 items-center gap-3 rounded-lg border border-default/10 bg-surface px-3 py-2.5 transition-colors hover:border-default/18 hover:bg-foreground/[0.02]"
							>
								<p className="truncate text-sm font-medium">{stack.name}</p>
								<Badge className="shrink-0">{stack.environment.name}</Badge>
							</Link>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

function MetricInline({
	icon,
	value,
	label,
	first,
}: {
	icon: React.ReactNode;
	value: string;
	label: string;
	first?: boolean;
}) {
	return (
		<div className={`flex items-center gap-2.5 ${first ? "pr-5" : "px-5"}`}>
			{icon}
			<div>
				<p className="text-xl font-bold tabular-nums tracking-tight leading-none">{value}</p>
				<p className="mt-0.5 text-[11px] text-muted">{label}</p>
			</div>
		</div>
	);
}
