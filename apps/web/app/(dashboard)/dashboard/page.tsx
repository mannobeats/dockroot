import { DashboardAttentionBanner } from "@/app/(dashboard)/dashboard/_components/dashboard-attention-banner";
import { DashboardHeader } from "@/app/(dashboard)/dashboard/_components/dashboard-header";
import { DashboardInfrastructurePanel } from "@/app/(dashboard)/dashboard/_components/dashboard-infrastructure-panel";
import { DashboardMetricsStrip } from "@/app/(dashboard)/dashboard/_components/dashboard-metrics-strip";
import { DashboardRecentStacks } from "@/app/(dashboard)/dashboard/_components/dashboard-recent-stacks";
import {
	buildAttentionItems,
	buildDeploymentStatus,
	getDashboardGreeting,
	serializeRecentDeployments,
} from "@/app/(dashboard)/dashboard/_lib/dashboard-page-utils";
import { DashboardStatusPanel } from "@/components/dashboard-status-panel";
import { RuntimeUnavailablePanel } from "@/components/runtime-unavailable-panel";
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
		includeRuntime
			? getRuntimeCollectorHealth(environment, { runtimeAvailable: Boolean(runtimeIssue === null) })
			: null,
	]);
	const runtime = runtimeResult;
	const runtimeFallbackMetrics =
		includeRuntime && runtime
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
	const dashboardMetrics =
		metrics?.available && runtimeFallbackMetrics
			? {
					...metrics,
					cpuPercent: metrics.cpuPercent ?? runtimeFallbackMetrics.cpuPercent,
					memoryPercent: metrics.memoryPercent ?? runtimeFallbackMetrics.memoryPercent,
					cpuSeries: metrics.cpuSeries.length
						? metrics.cpuSeries
						: runtimeFallbackMetrics.cpuSeries,
					memorySeries: metrics.memorySeries.length
						? metrics.memorySeries
						: runtimeFallbackMetrics.memorySeries,
					runningContainers: metrics.runningContainers ?? runtimeFallbackMetrics.runningContainers,
					containerCount: metrics.containerCount ?? runtimeFallbackMetrics.containerCount,
					imageCount: metrics.imageCount ?? runtimeFallbackMetrics.imageCount,
					memoryUsedBytes: metrics.memoryUsedBytes ?? runtimeFallbackMetrics.memoryUsedBytes,
					memoryTotalBytes: metrics.memoryTotalBytes ?? runtimeFallbackMetrics.memoryTotalBytes,
				}
			: metrics?.available
				? metrics
				: runtimeFallbackMetrics;
	const collectorHealth = targets || null;
	const deploymentStatus = buildDeploymentStatus(data.recentDeployments, environment.id);
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

	const greeting = getDashboardGreeting();

	const attentionItems = buildAttentionItems({
		recentDeployments: data.recentDeployments,
		collectorHealth,
		environmentStatus: environment.status,
	});

	const activityLink = `/dashboard/activity?environment=${environment.id}`;

	const serializedDeployments = serializeRecentDeployments(data.recentDeployments);

	const containerCount = includeRuntime && runtime ? runtime.snapshot.counts.containers : null;
	const imageCount = includeRuntime && runtime ? runtime.snapshot.counts.images : null;

	return (
		<div className="animate-in space-y-5">
			<DashboardHeader
				userName={session.user.name}
				greeting={greeting}
				environmentName={environment.name}
				environmentId={environment.id}
			/>

			<DashboardAttentionBanner items={attentionItems} />

			{runtimeIssue ? (
				<RuntimeUnavailablePanel
					title={`${environment.name} is not ready yet`}
					message={runtimeIssue}
				/>
			) : null}

			<DashboardMetricsStrip
				stackCount={data.stackCount}
				environmentCount={data.environmentCount}
				deploymentCount={data.deploymentCount}
				containerCount={containerCount}
				imageCount={imageCount}
			/>

			{/* Row 4: Two-column main content */}
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
				<DashboardInfrastructurePanel
					includeRuntime={includeRuntime}
					dashboardMetrics={dashboardMetrics}
					runtime={runtime}
					hostTotalMemoryGb={hostTotalMemoryGb}
					memoryUsedPercent={memoryUsedPercent}
					memoryUsed={memoryUsed}
					dataDir={data.dataDir}
				/>

				{/* Right: Status & Activity tabs */}
				<DashboardStatusPanel
					recentDeployments={serializedDeployments}
					deploymentStatus={deploymentStatus}
					environmentStatus={environmentStatus}
					collectors={collectorHealth}
					activityLink={activityLink}
				/>
			</div>

			<DashboardRecentStacks stacks={data.recentStacks} environmentId={environment.id} />
		</div>
	);
}
