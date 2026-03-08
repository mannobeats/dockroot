import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
	deleteEnvironmentAction,
	rotateAgentRegistrationTokenAction,
} from "@/app/(dashboard)/actions";
import { CopyButton } from "@/components/copy-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
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
	const environment = await getEnvironmentById(environmentId, session.user.id);

	if (!environment) {
		return <div className="text-sm text-muted">Environment not found.</div>;
	}

	const installCommands =
		environment.kind === "agent" ? await getInstallCommand(environment.id, session.user.id) : null;
	const agent = environment.agent[0];

	return (
		<div className="animate-in space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<LinkButton href="/dashboard/environments" variant="outline" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</LinkButton>
					<div>
						<div className="flex items-center gap-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">
								Environment
							</p>
							<StatusBadge status={environment.status} />
						</div>
						<h1 className="text-lg font-semibold">{environment.name}</h1>
					</div>
				</div>
				<LinkButton href={`/dashboard?environment=${environment.id}`} size="sm">
					Open workspace
				</LinkButton>
				{environment.isDefaultLocal ? null : (
					<form action={deleteEnvironmentAction}>
						<input type="hidden" name="environmentId" value={environment.id} />
						<FormSubmitButton label="Delete environment" pendingLabel="Deleting..." variant="quietDanger" size="sm" />
					</form>
				)}
			</div>

			{/* Connection details */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Kind" value={environment.kind} valueClassName="text-sm capitalize" />
				<MetricCard label="Agent URL" value={environment.managerUrl || "Not configured"} valueClassName="break-all text-sm" />
				<MetricCard label="Hostname" value={agent?.hostname || "Pending install"} valueClassName="text-sm" />
				<MetricCard label="Docker version" value={agent?.dockerVersion || "Pending install"} valueClassName="text-sm" />
			</div>

			{/* Install commands */}
			{installCommands ? (
				<div className="space-y-4">
					<Panel padding="sm" className="flex items-center justify-between">
						<div>
							<p className="text-sm font-semibold">Registration token</p>
							<p className="mt-0.5 text-xs text-muted">Stable until you rotate it manually.</p>
						</div>
						<form action={rotateAgentRegistrationTokenAction}>
							<input type="hidden" name="environmentId" value={environment.id} />
							<FormSubmitButton label="Rotate token" pendingLabel="Rotating..." variant="outline" size="xs" />
						</form>
					</Panel>
					<div className="grid gap-3 xl:grid-cols-2">
						<Panel className="bg-console p-4">
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs font-medium text-console-foreground/60">Docker Compose</p>
								<CopyButton value={installCommands.dockerCompose} />
							</div>
							<LogBlock className="mt-3 border-0 bg-transparent p-0 text-console-foreground/90">
								{installCommands.dockerCompose}
							</LogBlock>
						</Panel>
						<Panel className="bg-console p-4">
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs font-medium text-console-foreground/60">Docker Run</p>
								<CopyButton value={installCommands.dockerRun} />
							</div>
							<LogBlock className="mt-3 border-0 bg-transparent p-0 text-console-foreground/90">
								{installCommands.dockerRun}
							</LogBlock>
						</Panel>
					</div>
				</div>
			) : null}

			{/* Stacks and deployments in compact tables */}
			<div className="grid gap-5 xl:grid-cols-2">
				<Panel>
					<PanelHeader>
						<PanelTitle>Stacks ({environment.stacks.length})</PanelTitle>
					</PanelHeader>
					{environment.stacks.length ? (
						<div className="divide-y divide-default/5">
							{environment.stacks.map((stack) => (
								<div key={stack.id} className="flex items-center justify-between px-4 py-3">
									<div>
										<p className="text-sm font-medium">{stack.name}</p>
										<p className="mt-0.5 text-xs text-muted">{stack.description || stack.slug}</p>
									</div>
									<StatusBadge status={stack.status} />
								</div>
							))}
						</div>
					) : (
						<div className="p-6 text-center text-sm text-muted">
							No stacks assigned to this environment yet.
						</div>
					)}
				</Panel>

				<Panel>
					<PanelHeader>
						<PanelTitle>Recent deployments ({environment.deployments.length})</PanelTitle>
					</PanelHeader>
					{environment.deployments.length ? (
						<div className="divide-y divide-default/5">
							{environment.deployments.map((deployment) => (
								<div key={deployment.id} className="px-4 py-3">
									<div className="flex items-center justify-between gap-3">
										<p className="text-sm font-medium">{deployment.stack.name}</p>
										<StatusBadge status={deployment.status} />
									</div>
									<p className="mt-1 font-mono text-xs text-muted">{deployment.version}</p>
								</div>
							))}
						</div>
					) : (
						<div className="p-6 text-center text-sm text-muted">
							No deployments have targeted this environment yet.
						</div>
					)}
				</Panel>
			</div>
		</div>
	);
}
