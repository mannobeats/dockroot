import {
	ArrowLeft,
	Lock,
	Logs as LogsIcon,
	Play,
	RefreshCw,
	Square,
	SquareTerminal,
	Trash2,
} from "lucide-react";
import { controlContainerAction } from "@/app/(dashboard)/actions";
import { ContainerDetailTabs } from "@/components/container-detail-tabs";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import {
	browseContainerPathForEnvironment,
	getContainerDetailsForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { getGlobalSettings } from "@/lib/platform";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";
import { getContainerRuntimeMetrics } from "@/lib/runtime-metrics";
import { getProtectedContainerLabel, isProtectedManagerContainer } from "@/lib/runtime-protection";

const sensitiveEnvPattern =
	/(SECRET|TOKEN|PASSWORD|KEY|PRIVATE|COOKIE|SESSION|AUTH|DATABASE_URL|CONNECTION_STRING)/i;

function redactEnvVars(envVars: string[]) {
	return envVars.map((entry) => {
		const separatorIndex = entry.indexOf("=");
		if (separatorIndex === -1) {
			return entry;
		}

		const key = entry.slice(0, separatorIndex);
		const value = entry.slice(separatorIndex + 1);

		if (!sensitiveEnvPattern.test(key)) {
			return `${key}=${value}`;
		}

		if (!value) {
			return `${key}=`;
		}

		const preview =
			value.length <= 8 ? "*".repeat(value.length) : `${value.slice(0, 2)}***${value.slice(-2)}`;
		return `${key}=${preview}`;
	});
}

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
			? environment.managerUrl || undefined
			: settings.managerUrl || environment.managerUrl || undefined;
	await requireAccessibleContainerForUser({
		containerId,
		userId: auth.userId,
		role: auth.role,
		environmentId: environment.id,
	});
	const targetPath = query.path || "/";
	const details = await getContainerDetailsForEnvironment(auth.userId, containerId, environment.id);
	const inspect = details.details?.inspect;

	if (!inspect) {
		return <div className="text-sm text-muted">Container not found.</div>;
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
	const serializedLabels = Object.entries(labels)
		.map(([key, value]) => `${key}=${value}`)
		.join(",");
	const networkEntries = Object.entries(
		(inspect.NetworkSettings?.Networks || {}) as Record<
			string,
			{ IPAddress?: string; Gateway?: string }
		>,
	);
	const publishedPorts = Object.entries(
		(inspect.NetworkSettings?.Ports || {}) as Record<
			string,
			Array<{ HostIp?: string; HostPort?: string }> | null
		>,
	)
		.flatMap(([containerPort, bindings]) =>
			(bindings || []).map((binding) => ({
				containerPort,
				hostIp: binding.HostIp || "localhost",
				hostPort: binding.HostPort || "",
			})),
		)
		.filter((binding) => binding.hostPort);
	const publishedPortSummary = publishedPorts
		.map((binding) => `${binding.hostIp}:${binding.hostPort}->${binding.containerPort}`)
		.join(", ");
	const protectedContainer = {
		ID: containerId,
		Image: inspect.Config?.Image,
		Names: inspect.Name?.replace(/^\//, ""),
		Labels: serializedLabels,
	};
	const isProtected =
		environment.kind === "local" && isProtectedManagerContainer(protectedContainer);
	const protectedLabel =
		environment.kind === "local" ? getProtectedContainerLabel(protectedContainer) : "";

	const containerName = inspect.Name?.replace(/^\//, "") || containerId;
	const containerState = String(inspect.State?.Status || "offline").toLowerCase();
	const isRunning = containerState === "running";

	return (
		<div className="animate-in space-y-5">
			{/* Header */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5">
					<LinkButton
						href={`/dashboard/containers?environment=${environment.id}`}
						variant="ghost"
						size="icon-sm"
					>
						<ArrowLeft className="h-4 w-4" />
					</LinkButton>
					<div>
						<div className="flex items-center gap-2">
							<h1 className="text-lg font-semibold">{containerName}</h1>
							<StatusBadge status={inspect.State?.Status || "offline"} />
							{isProtected ? (
								<Badge title={protectedLabel || undefined} variant="warning">
									<Lock className="h-2.5 w-2.5" />
								</Badge>
							) : null}
						</div>
						<p className="text-xs text-muted">
							{inspect.Config?.Image} · {environment.name}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-0.5">
					{isRunning ? (
						<>
							<form action={controlContainerAction}>
								<input type="hidden" name="containerId" value={containerId} />
								<input type="hidden" name="action" value="stop" />
								<input type="hidden" name="environmentId" value={environment.id} />
								<FormSubmitButton
									label=""
									pendingLabel=""
									disabled={isProtected}
									variant="ghost"
									size="xs"
									title="Stop"
									className="h-8 w-8 p-0"
								>
									<Square className="h-4 w-4" />
								</FormSubmitButton>
							</form>
							<form action={controlContainerAction}>
								<input type="hidden" name="containerId" value={containerId} />
								<input type="hidden" name="action" value="restart" />
								<input type="hidden" name="environmentId" value={environment.id} />
								<FormSubmitButton
									label=""
									pendingLabel=""
									disabled={isProtected}
									variant="ghost"
									size="xs"
									title="Restart"
									className="h-8 w-8 p-0"
								>
									<RefreshCw className="h-4 w-4" />
								</FormSubmitButton>
							</form>
						</>
					) : (
						<>
							<form action={controlContainerAction}>
								<input type="hidden" name="containerId" value={containerId} />
								<input type="hidden" name="action" value="start" />
								<input type="hidden" name="environmentId" value={environment.id} />
								<FormSubmitButton
									label=""
									pendingLabel=""
									disabled={isProtected}
									variant="ghost"
									size="xs"
									title="Start"
									className="h-8 w-8 p-0"
								>
									<Play className="h-4 w-4" />
								</FormSubmitButton>
							</form>
							<DestructiveActionModal
								action={controlContainerAction}
								title={`Remove container ${containerName}`}
								description="This permanently removes the container."
								triggerLabel=""
								confirmLabel="Remove"
								pendingLabel="Removing..."
								triggerVariant="ghost"
								triggerSize="xs"
								disabled={isProtected}
								triggerClassName="h-8 w-8 p-0 text-muted hover:text-danger"
								triggerIcon={<Trash2 className="h-4 w-4" />}
								hiddenFields={{
									containerId,
									action: "remove",
									environmentId: environment.id,
								}}
								options={[
									{
										name: "removeVolumes",
										label: "Remove anonymous volumes",
										description: "Data in attached anonymous volumes will be lost.",
									},
								]}
							/>
						</>
					)}
					<LinkButton
						href={`/dashboard/shell?target=container&containerId=${containerId}&environment=${environment.id}`}
						variant="ghost"
						size="icon-sm"
						title="Shell"
					>
						<SquareTerminal className="h-4 w-4" />
					</LinkButton>
					<LinkButton
						href={`/dashboard/logs?mode=single&container=${containerId}&environment=${environment.id}`}
						variant="ghost"
						size="icon-sm"
						title="Logs"
					>
						<LogsIcon className="h-4 w-4" />
					</LinkButton>
				</div>
			</div>

			<ContainerDetailTabs
				containerId={containerId}
				environmentId={environment.id}
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
				browser={
					browser.kind === "directory"
						? { kind: "directory" as const, path: browser.path, entries: browser.entries || [] }
						: browser.kind === "file"
							? { kind: "file" as const, path: browser.path, content: browser.content || "" }
							: { kind: "missing" as const, path: browser.path }
				}
				targetPath={targetPath}
				initialTab={query.tab}
			/>
		</div>
	);
}
