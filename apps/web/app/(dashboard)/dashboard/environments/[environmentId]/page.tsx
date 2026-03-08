import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { rotateAgentRegistrationTokenAction } from "@/app/(dashboard)/actions";
import { CopyButton } from "@/components/copy-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StatusBadge } from "@/components/status-badge";
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
					<Link
						href="/dashboard/environments"
						className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-default/10 text-muted transition-colors hover:text-foreground"
					>
						<ArrowLeft className="h-4 w-4" />
					</Link>
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
				<Link
					href={`/dashboard?environment=${environment.id}`}
					className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
				>
					Open workspace
				</Link>
			</div>

			{/* Connection details */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Kind</p>
					<p className="mt-2 text-sm font-medium capitalize">{environment.kind}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Agent URL</p>
					<p className="mt-2 break-all text-sm font-medium">
						{environment.managerUrl || "Not configured"}
					</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Hostname</p>
					<p className="mt-2 text-sm font-medium">{agent?.hostname || "Pending install"}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Docker version</p>
					<p className="mt-2 text-sm font-medium">{agent?.dockerVersion || "Pending install"}</p>
				</div>
			</div>

			{/* Install commands */}
			{installCommands ? (
				<div className="space-y-4">
					<div className="flex items-center justify-between rounded-xl border border-default/10 bg-surface px-4 py-3">
						<div>
							<p className="text-sm font-semibold">Registration token</p>
							<p className="mt-0.5 text-xs text-muted">Stable until you rotate it manually.</p>
						</div>
						<form action={rotateAgentRegistrationTokenAction}>
							<input type="hidden" name="environmentId" value={environment.id} />
							<FormSubmitButton
								label="Rotate token"
								pendingLabel="Rotating..."
								className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
							/>
						</form>
					</div>
					<div className="grid gap-3 xl:grid-cols-2">
						<div className="rounded-xl border border-default/10 bg-[#0a0a0a] p-4">
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs font-medium text-white/60">Docker Compose</p>
								<CopyButton value={installCommands.dockerCompose} />
							</div>
							<pre className="log-viewport mt-3 text-xs leading-6 text-white/80">
								{installCommands.dockerCompose}
							</pre>
						</div>
						<div className="rounded-xl border border-default/10 bg-[#0a0a0a] p-4">
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs font-medium text-white/60">Docker Run</p>
								<CopyButton value={installCommands.dockerRun} />
							</div>
							<pre className="log-viewport mt-3 text-xs leading-6 text-white/80">
								{installCommands.dockerRun}
							</pre>
						</div>
					</div>
				</div>
			) : null}

			{/* Stacks and deployments in compact tables */}
			<div className="grid gap-5 xl:grid-cols-2">
				<div className="rounded-xl border border-default/10 bg-surface">
					<div className="border-b border-default/10 px-4 py-3">
						<h2 className="text-sm font-semibold">Stacks ({environment.stacks.length})</h2>
					</div>
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
				</div>

				<div className="rounded-xl border border-default/10 bg-surface">
					<div className="border-b border-default/10 px-4 py-3">
						<h2 className="text-sm font-semibold">
							Recent deployments ({environment.deployments.length})
						</h2>
					</div>
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
				</div>
			</div>
		</div>
	);
}
