import { controlContainerAction } from "@/app/(dashboard)/actions";
import { ContainerDetailTabs } from "@/components/container-detail-tabs";
import { RuntimeUnavailablePanel } from "@/components/runtime-unavailable-panel";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import {
	browseContainerPathForEnvironment,
	getContainerDetailsForEnvironment,
	getRuntimeConnectionMessage,
	isRuntimeConnectionError,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { getGlobalSettings } from "@/lib/platform";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";
import { getContainerRuntimeMetrics } from "@/lib/runtime-metrics";
import { getProtectedContainerLabel, isProtectedManagerContainer } from "@/lib/runtime-protection";
import {
	buildPublishedPortSummary,
	mapContainerBrowserState,
	redactEnvVars,
	serializeContainerLabels,
} from "./container-detail-data";
import { ContainerDetailHeader } from "./container-detail-header";

export default async function ContainerDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ containerId: string }>;
	searchParams: Promise<{ path?: string; environment?: string; tab?: string }>;
}) {
	const auth = await requireUserSession();
	const { containerId } = await params;
	const query = await searchParams;
	const settings = await getGlobalSettings(auth.userId);
	const environment = await resolveRuntimeEnvironment(auth.userId, query.environment);
	const runtimeUrl =
		environment.kind === "agent"
			? (environment.managerUrl ?? undefined)
			: (settings.managerUrl ?? environment.managerUrl ?? undefined);

	try {
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
			environmentId: environment.id,
		});

		const targetPath = query.path || "/";
		const details = await getContainerDetailsForEnvironment(
			auth.userId,
			containerId,
			environment.id,
		);
		const inspect = details.details?.inspect;

		if (!inspect) {
			return <div className="text-sm text-muted">Container not found in this environment.</div>;
		}

		const metrics = await getContainerRuntimeMetrics({
			environmentId: environment.id,
			containerId: String(inspect.Id || containerId),
			containerName: String(inspect.Name || "").replace(/^\//, ""),
		});

		const { browser } = await browseContainerPathForEnvironment(
			auth.userId,
			containerId,
			targetPath,
			environment.id,
		);
		const canOpenRuntimeTopology = isPrivilegedRole(auth.role);
		const mounts = Array.isArray(inspect.Mounts) ? inspect.Mounts : [];
		const envVars = redactEnvVars(inspect.Config?.Env || []);
		const labels = inspect.Config?.Labels || {};
		const serializedLabels = serializeContainerLabels(labels);
		const networkEntries = Object.entries(
			(inspect.NetworkSettings?.Networks || {}) as Record<
				string,
				{ IPAddress?: string; Gateway?: string }
			>,
		);
		const publishedPortSummary = buildPublishedPortSummary(
			(inspect.NetworkSettings?.Ports || {}) as Record<
				string,
				Array<{ HostIp?: string; HostPort?: string }> | null
			>,
		);

		const protectedContainer = {
			ID: containerId,
			Image: inspect.Config?.Image,
			Names: inspect.Name?.replace(/^\//, ""),
			Labels: serializedLabels,
		};
		const isProtected =
			environment.kind === "local" && isProtectedManagerContainer(protectedContainer);
		const protectedLabel =
			environment.kind === "local"
				? getProtectedContainerLabel(protectedContainer) || undefined
				: undefined;

		const containerName = inspect.Name?.replace(/^\//, "") || containerId;
		const containerState = String(inspect.State?.Status || "offline").toLowerCase();
		const isRunning = containerState === "running";

		return (
			<div className="animate-in space-y-5">
				<ContainerDetailHeader
					containerId={containerId}
					containerName={containerName}
					containerState={inspect.State?.Status || "offline"}
					image={inspect.Config?.Image || undefined}
					environmentId={environment.id}
					environmentName={environment.name}
					isProtected={isProtected}
					protectedLabel={protectedLabel}
					isRunning={isRunning}
					controlContainerAction={controlContainerAction}
				/>

				<ContainerDetailTabs
					containerId={containerId}
					environmentId={environment.id}
					environmentKind={environment.kind}
					inspect={inspect}
					details={details.details}
					metrics={metrics}
					mounts={mounts}
					envVars={envVars}
					labels={labels}
					networkEntries={networkEntries}
					publishedPortSummary={publishedPortSummary}
					managerUrl={runtimeUrl}
					canOpenRuntimeTopology={canOpenRuntimeTopology}
					browser={mapContainerBrowserState(browser)}
					targetPath={targetPath}
					initialTab={query.tab}
				/>
			</div>
		);
	} catch (error) {
		if (isRuntimeConnectionError(error)) {
			return (
				<RuntimeUnavailablePanel
					title="Container runtime unavailable"
					message={getRuntimeConnectionMessage(error)}
				/>
			);
		}

		if (error instanceof Error && /container not found/i.test(error.message)) {
			return <div className="text-sm text-muted">Container not found in this environment.</div>;
		}

		console.error("[container-detail] failed to render container page:", error);
		return (
			<RuntimeUnavailablePanel
				title="Container details unavailable"
				message="Unable to load container details right now."
			/>
		);
	}
}
