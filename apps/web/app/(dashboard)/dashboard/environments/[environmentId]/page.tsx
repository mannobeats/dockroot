import { ArrowLeft, Trash2 } from "lucide-react";
import { headers } from "next/headers";
import {
	deleteEnvironmentAction,
	rotateAgentRegistrationTokenAction,
	updateEnvironmentAction,
} from "@/app/(dashboard)/actions";
import { CopyButton } from "@/components/copy-button";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { EnvironmentLiveRefresh } from "@/components/environment-live-refresh";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { getRuntimeSnapshotForEnvironment } from "@/lib/environment-runtime";
import { inferRequestManagerUrl } from "@/lib/manager-url";
import { getEnvironmentById, getInstallCommand } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function EnvironmentDetailPage({
	params,
}: {
	params: Promise<{ environmentId: string }>;
}) {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const { environmentId } = await params;
	const requestHeaders = await headers();
	const environment = await getEnvironmentById(environmentId, session.user.id);

	if (!environment) {
		return <div className="text-sm text-muted">Environment not found.</div>;
	}

	const detectedManagerUrl = inferRequestManagerUrl(requestHeaders);
	const runtime =
		environment.kind === "local"
			? await getRuntimeSnapshotForEnvironment(session.user.id, environment.id).catch(() => null)
			: null;
	const installCommands =
		environment.kind === "agent"
			? await getInstallCommand(environment.id, session.user.id, {
					managerUrl: detectedManagerUrl,
				})
			: null;
	const agent = environment.agent[0];
	const hostname =
		environment.kind === "local"
			? runtime?.snapshot.host.hostname || agent?.hostname || "Unavailable"
			: agent?.hostname || "Pending install";
	const dockerVersion =
		environment.kind === "local"
			? runtime?.snapshot.host.dockerVersion || agent?.dockerVersion || "Unavailable"
			: agent?.dockerVersion || "Pending install";
	const runtimeEndpoint =
		environment.kind === "local"
			? detectedManagerUrl || environment.managerUrl || "Not configured"
			: environment.managerUrl || "Not configured";

	return (
		<div className="animate-in space-y-5">
			<EnvironmentLiveRefresh environmentId={environment.id} />
			{/* Header */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5">
					<LinkButton href="/dashboard/environments" variant="ghost" size="icon-sm">
						<ArrowLeft className="h-4 w-4" />
					</LinkButton>
					<div>
						<div className="flex items-center gap-2">
							<h1 className="text-lg font-semibold">{environment.name}</h1>
							<StatusBadge status={environment.status} />
						</div>
						<p className="text-xs text-muted capitalize">{environment.kind} environment</p>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<LinkButton href={`/dashboard?environment=${environment.id}`} size="sm">
						Open workspace
					</LinkButton>
					{environment.isDefaultLocal ? null : (
						<DestructiveActionModal
							action={deleteEnvironmentAction}
							title={`Delete environment ${environment.name}`}
							description="This will permanently remove the environment and linked runtime metadata."
							triggerLabel=""
							confirmLabel="Delete"
							pendingLabel="Deleting..."
							triggerVariant="ghost"
							triggerSize="sm"
							hiddenFields={{ environmentId: environment.id }}
							triggerClassName="h-8 w-8 p-0 text-muted hover:text-danger"
							triggerIcon={<Trash2 className="h-4 w-4" />}
						/>
					)}
				</div>
			</div>

			{/* Connection details */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Kind" value={environment.kind} valueClassName="text-sm capitalize" />
				<MetricCard
					label={environment.kind === "local" ? "Runtime URL" : "Agent URL"}
					value={runtimeEndpoint}
					valueClassName="break-all text-sm"
				/>
				<MetricCard label="Hostname" value={hostname} valueClassName="text-sm" />
				<MetricCard label="Docker version" value={dockerVersion} valueClassName="text-sm" />
			</div>

			<Panel className="space-y-3 p-4">
				<div>
					<p className="text-sm font-semibold">Environment details</p>
					<p className="mt-1 text-xs text-muted">
						Rename this environment to keep your sidebar and workspace organized.
					</p>
				</div>
				<form
					action={updateEnvironmentAction}
					className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto]"
				>
					<input type="hidden" name="environmentId" value={environment.id} />
					<Field>
						<FieldLabel htmlFor="environment-name">Name</FieldLabel>
						<Input id="environment-name" name="name" required defaultValue={environment.name} />
					</Field>
					<Field>
						<FieldLabel htmlFor="environment-description">Description</FieldLabel>
						<Input
							id="environment-description"
							name="description"
							defaultValue={environment.description || ""}
							placeholder="Short description for this environment"
						/>
					</Field>
					{environment.kind === "agent" ? (
						<Field>
							<FieldLabel htmlFor="environment-agent-url">Agent URL</FieldLabel>
							<Input
								id="environment-agent-url"
								name="agentUrl"
								defaultValue={environment.managerUrl || ""}
								placeholder="http://remote-host:9095"
							/>
						</Field>
					) : null}
					<div className="flex items-end">
						<FormSubmitButton label="Save changes" pendingLabel="Saving..." size="sm" />
					</div>
				</form>
			</Panel>

			{/* Install commands */}
			{installCommands ? (
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<p className="text-sm font-semibold">Install commands</p>
						<form action={rotateAgentRegistrationTokenAction}>
							<input type="hidden" name="environmentId" value={environment.id} />
							<FormSubmitButton
								label="Rotate token"
								pendingLabel="Rotating..."
								variant="outline"
								size="xs"
							/>
						</form>
					</div>
					<Panel className="px-3 py-2">
						<p className="text-xs font-medium text-muted">
							Manager address used in generated commands
						</p>
						<p className="mt-1 break-all text-sm font-medium text-foreground">
							{installCommands.managerUrl}
						</p>
						<p className="mt-1 text-[11px] text-muted">
							Update this from Settings if you want agents to connect through a different IP or
							domain.
						</p>
					</Panel>
					<div className="grid gap-3 xl:grid-cols-2">
						<Panel className="bg-console p-3">
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs font-medium text-console-foreground/60">Docker Compose</p>
								<CopyButton value={installCommands.dockerCompose} />
							</div>
							<LogBlock className="mt-2 border-0 bg-transparent p-0 text-console-foreground/90">
								{installCommands.dockerCompose}
							</LogBlock>
						</Panel>
						<Panel className="bg-console p-3">
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs font-medium text-console-foreground/60">Docker Run</p>
								<CopyButton value={installCommands.dockerRun} />
							</div>
							<LogBlock className="mt-2 border-0 bg-transparent p-0 text-console-foreground/90">
								{installCommands.dockerRun}
							</LogBlock>
						</Panel>
					</div>
				</div>
			) : null}

			{/* Stacks and deployments */}
			<div className="grid gap-4 xl:grid-cols-2">
				<Panel>
					<PanelHeader>
						<PanelTitle>Stacks ({environment.stacks.length})</PanelTitle>
					</PanelHeader>
					{environment.stacks.length ? (
						<div className="divide-y divide-default/5">
							{environment.stacks.map((stack) => (
								<div key={stack.id} className="flex items-center justify-between px-3 py-2.5">
									<div>
										<p className="text-sm font-medium">{stack.name}</p>
										<p className="text-[11px] text-muted">{stack.description || stack.slug}</p>
									</div>
									<StatusBadge status={stack.status} />
								</div>
							))}
						</div>
					) : (
						<div className="p-6 text-center text-sm text-muted">No stacks assigned yet.</div>
					)}
				</Panel>

				<Panel>
					<PanelHeader>
						<PanelTitle>Recent deployments ({environment.deployments.length})</PanelTitle>
					</PanelHeader>
					{environment.deployments.length ? (
						<div className="divide-y divide-default/5">
							{environment.deployments.map((deployment) => (
								<div key={deployment.id} className="px-3 py-2.5">
									<div className="flex items-center justify-between gap-3">
										<p className="text-sm font-medium">
											{deployment.stackName || deployment.stack?.name || "Deleted stack"}
										</p>
										<StatusBadge status={deployment.status} />
									</div>
									<p className="mt-0.5 font-mono text-[11px] text-muted">{deployment.version}</p>
								</div>
							))}
						</div>
					) : (
						<div className="p-6 text-center text-sm text-muted">No deployments yet.</div>
					)}
				</Panel>
			</div>
		</div>
	);
}
