import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { controlContainerAction } from "@/app/(dashboard)/actions";
import { CodeEditor } from "@/components/code-editor";
import { ContainerFileBrowser } from "@/components/container-file-browser";
import { ContainerMetricsPanel } from "@/components/container-metrics-panel";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { RuntimePortLinks } from "@/components/runtime-port-links";
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
	searchParams: Promise<{ path?: string; environment?: string }>;
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

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title={inspect.Name?.replace(/^\//, "") || containerId}
				description={`${inspect.Config?.Image || "Container details"} · ${environment.name}`}
				actions={
					<>
						<Link
							href={`/dashboard/containers?environment=${environment.id}`}
							className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back
						</Link>
						{(["start", "stop", "restart", "remove"] as const).map((action) => (
							<form key={action} action={controlContainerAction}>
								<input type="hidden" name="containerId" value={containerId} />
								<input type="hidden" name="action" value={action} />
								<input type="hidden" name="environmentId" value={environment.id} />
								<FormSubmitButton
									label={action}
									pendingLabel={`${action}ing...`}
									disabled={isProtected}
									title={
										isProtected
											? "Dockroot protected containers cannot be modified from the runtime dashboard."
											: undefined
									}
									className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
								/>
							</form>
						))}
						<Link
							href={`/dashboard/shell?target=container&containerId=${containerId}&environment=${environment.id}`}
							className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium text-muted transition-colors hover:text-foreground"
						>
							Shell
						</Link>
					</>
				}
			/>

			{metrics ? <ContainerMetricsPanel metrics={metrics} /> : null}

			<div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold tracking-tight">Details</h2>
						<StatusBadge status={inspect.State?.Status || "offline"} />
						{isProtected ? (
							<span
								title={protectedLabel || undefined}
								className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning"
							>
								<Lock className="h-3 w-3" />
								Locked
							</span>
						) : null}
					</div>
					<div className="mt-5 grid gap-3 sm:grid-cols-2">
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Image</p>
							<p className="mt-2 text-sm font-medium">{inspect.Config?.Image}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Started at</p>
							<p className="mt-2 text-sm font-medium">{inspect.State?.StartedAt || "—"}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">IP address</p>
							<p className="mt-2 text-sm font-medium">
								{inspect.NetworkSettings?.IPAddress || "Docker network scoped"}
							</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Restart count</p>
							<p className="mt-2 text-sm font-medium">{inspect.RestartCount || 0}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4 sm:col-span-2">
							<p className="text-xs text-muted">Published ports</p>
							<div className="mt-3">
								<RuntimePortLinks ports={publishedPortSummary} />
							</div>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Writable layer size</p>
							<p className="mt-2 text-sm font-medium">{details.details?.stats?.Size || "—"}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Memory / CPU</p>
							<p className="mt-2 text-sm font-medium">
								{details.details?.stats
									? `${details.details.stats.MemUsage || "—"} · ${details.details.stats.CPUPerc || "—"}`
									: "—"}
							</p>
						</div>
					</div>

					<div className="mt-5 grid gap-4 lg:grid-cols-2">
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-sm font-semibold">Mounts</p>
							<div className="mt-3 space-y-2 text-sm text-muted">
								{mounts.length ? (
									mounts.map((mount: { Source?: string; Destination?: string; Type?: string }) => (
										<div
											key={`${mount.Source}-${mount.Destination}`}
											className="rounded-lg bg-surface px-3 py-2"
										>
											<p>{mount.Destination}</p>
											<p className="mt-1 text-xs">
												{mount.Source || mount.Type || "Docker managed"}
											</p>
										</div>
									))
								) : (
									<p>No mounts configured.</p>
								)}
							</div>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-sm font-semibold">Networks</p>
							<div className="mt-3 space-y-2 text-sm text-muted">
								{networkEntries.length ? (
									networkEntries.map(
										([name, network]: [string, { IPAddress?: string; Gateway?: string }]) =>
											canOpenRuntimeTopology ? (
												<Link
													key={name}
													href={`/dashboard/networks/${encodeURIComponent(name)}?environment=${environment.id}`}
													className="block rounded-lg bg-surface px-3 py-2 transition-colors hover:text-foreground"
												>
													<p>{name}</p>
													<p className="mt-1 text-xs">
														IP {network.IPAddress || "—"} · GW {network.Gateway || "—"}
													</p>
												</Link>
											) : (
												<div key={name} className="rounded-lg bg-surface px-3 py-2">
													<p>{name}</p>
													<p className="mt-1 text-xs">
														IP {network.IPAddress || "—"} · GW {network.Gateway || "—"}
													</p>
												</div>
											),
									)
								) : (
									<p>No network attachments reported.</p>
								)}
							</div>
						</div>
					</div>
				</section>

				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold tracking-tight">Logs</h2>
						<Link
							href={`/dashboard/logs?mode=single&container=${containerId}&environment=${environment.id}`}
							className="text-sm font-medium text-accent"
						>
							Open full log workspace
						</Link>
					</div>
					<pre className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/80">
						{details.details?.logs || "No logs available."}
					</pre>
				</section>
			</div>

			<div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
				<ContainerFileBrowser
					containerId={containerId}
					path={targetPath}
					environmentId={environment.id}
					browser={
						browser.kind === "directory"
							? { kind: "directory", path: browser.path, entries: browser.entries || [] }
							: browser.kind === "file"
								? { kind: "file", path: browser.path, content: browser.content || "" }
								: { kind: "missing", path: browser.path }
					}
				/>

				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<h2 className="text-lg font-semibold tracking-tight">Environment and labels</h2>
					<div className="mt-4 grid gap-4 xl:grid-cols-2">
						<div className="overflow-hidden rounded-xl border border-default/15">
							<div className="border-b border-default/10 px-4 py-3">
								<p className="text-sm font-semibold">Environment variables</p>
							</div>
							<CodeEditor value={envVars.join("\n")} language="env" readOnly minHeight="420px" />
						</div>
						<div className="overflow-hidden rounded-xl border border-default/15">
							<div className="border-b border-default/10 px-4 py-3">
								<p className="text-sm font-semibold">Labels</p>
							</div>
							<CodeEditor
								value={JSON.stringify(labels, null, 2)}
								language="env"
								readOnly
								minHeight="420px"
							/>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
