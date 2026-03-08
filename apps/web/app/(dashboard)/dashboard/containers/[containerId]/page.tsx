import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { controlContainerAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import {
	browseContainerPathForEnvironment,
	getContainerDetailsForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { getPrometheusContainerMetrics } from "@/lib/prometheus";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";
import { getProtectedContainerLabel, isProtectedManagerContainer } from "@/lib/runtime-protection";
import { ContainerDetailTabs } from "@/components/container-detail-tabs";

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
	const environment = await resolveRuntimeEnvironment(auth.userId, query.environment);
	await requireAccessibleContainerForUser({
		containerId,
		userId: auth.userId,
		role: auth.role,
		environmentId: environment.id,
	});
	const targetPath = query.path || "/";
	const [details, metrics] = await Promise.all([
		getContainerDetailsForEnvironment(auth.userId, containerId, environment.id),
		environment.kind === "local"
			? getPrometheusContainerMetrics(containerId)
			: Promise.resolve(null),
	]);
	const inspect = details.details?.inspect;

	if (!inspect) {
		return <div className="text-sm text-muted">Container not found.</div>;
	}

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

	return (
		<div className="animate-in space-y-6">
			{/* Header with back + actions */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<Link
						href={`/dashboard/containers?environment=${environment.id}`}
						className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-default/10 text-muted transition-colors hover:text-foreground"
					>
						<ArrowLeft className="h-4 w-4" />
					</Link>
					<div>
						<div className="flex items-center gap-2">
							<h1 className="text-lg font-semibold">{containerName}</h1>
							<StatusBadge status={inspect.State?.Status || "offline"} />
							{isProtected ? (
								<span
									title={protectedLabel || undefined}
									className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
								>
									<Lock className="h-2.5 w-2.5" />
									Locked
								</span>
							) : null}
						</div>
						<p className="text-sm text-muted">{inspect.Config?.Image} · {environment.name}</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{(["start", "stop", "restart", "remove"] as const).map((action) => (
						<form key={action} action={controlContainerAction}>
							<input type="hidden" name="containerId" value={containerId} />
							<input type="hidden" name="action" value={action} />
							<input type="hidden" name="environmentId" value={environment.id} />
							<FormSubmitButton
								label={action}
								pendingLabel={`${action}ing...`}
								disabled={isProtected}
								className={`inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium capitalize transition-colors ${
									action === "remove"
										? "border border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
										: "border border-default/10 text-muted hover:text-foreground"
								} disabled:cursor-not-allowed disabled:opacity-40`}
							/>
						</form>
					))}
					<Link
						href={`/dashboard/shell?target=container&containerId=${containerId}&environment=${environment.id}`}
						className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
					>
						Shell
					</Link>
					<Link
						href={`/dashboard/logs?mode=single&container=${containerId}&environment=${environment.id}`}
						className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
					>
						Logs
					</Link>
				</div>
			</div>

			{/* Tabbed content — inspired by competitor's Overview | Metrics | Logs | Configuration | Networks | Storage tabs */}
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
