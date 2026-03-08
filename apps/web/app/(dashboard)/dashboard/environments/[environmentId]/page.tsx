import Link from "next/link";
import { rotateAgentRegistrationTokenAction } from "@/app/(dashboard)/actions";
import { CopyButton } from "@/components/copy-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
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
		<div className="space-y-6">
			<PageHeader
				kicker="Environment"
				title={environment.name}
				description={environment.description || "Remote server and agent state."}
				actions={
					<Link
						href={`/dashboard?environment=${environment.id}`}
						className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
					>
						Open workspace
					</Link>
				}
			/>

			<div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
				<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold tracking-tight">Connection</h2>
						<StatusBadge status={environment.status} />
					</div>
					<div className="mt-5 grid gap-4 md:grid-cols-2">
						<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Environment kind</p>
							<p className="mt-2 text-sm font-semibold capitalize">{environment.kind}</p>
						</div>
						<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Agent URL</p>
							<p className="mt-2 break-all text-sm font-semibold">
								{environment.managerUrl || "Not configured"}
							</p>
						</div>
						<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Hostname</p>
							<p className="mt-2 text-sm font-semibold">{agent?.hostname || "Pending install"}</p>
						</div>
						<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Docker version</p>
							<p className="mt-2 text-sm font-semibold">
								{agent?.dockerVersion || "Pending install"}
							</p>
						</div>
					</div>

					{installCommands ? (
						<div className="mt-5 space-y-4">
							<div className="flex items-center justify-between rounded-2xl border border-default/15 bg-background/60 px-4 py-3">
								<div>
									<p className="text-sm font-semibold">Registration token</p>
									<p className="mt-1 text-xs text-muted">Stable until you rotate it manually.</p>
								</div>
								<form action={rotateAgentRegistrationTokenAction}>
									<input type="hidden" name="environmentId" value={environment.id} />
									<FormSubmitButton
										label="Rotate token"
										pendingLabel="Rotating..."
										className="inline-flex h-10 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium"
									/>
								</form>
							</div>
							<div className="grid gap-4 xl:grid-cols-2">
								<div className="rounded-2xl border border-default/15 bg-[#050914] p-4">
									<div className="flex items-center justify-between gap-3">
										<p className="text-sm font-semibold text-white">Docker Compose</p>
										<CopyButton value={installCommands.dockerCompose} />
									</div>
									<pre className="mt-3 overflow-auto text-xs leading-6 text-white/80">
										{installCommands.dockerCompose}
									</pre>
								</div>
								<div className="rounded-2xl border border-default/15 bg-[#050914] p-4">
									<div className="flex items-center justify-between gap-3">
										<p className="text-sm font-semibold text-white">Docker Run</p>
										<CopyButton value={installCommands.dockerRun} />
									</div>
									<pre className="mt-3 overflow-auto text-xs leading-6 text-white/80">
										{installCommands.dockerRun}
									</pre>
								</div>
							</div>
						</div>
					) : null}
				</section>

				<section className="space-y-5">
					<div className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
						<h2 className="text-lg font-semibold tracking-tight">Stacks</h2>
						<div className="mt-4 space-y-3">
							{environment.stacks.length ? (
								environment.stacks.map((stack) => (
									<div
										key={stack.id}
										className="flex items-center justify-between rounded-2xl border border-default/15 bg-background/60 px-4 py-3"
									>
										<div>
											<p className="text-sm font-semibold">{stack.name}</p>
											<p className="text-sm text-muted">{stack.description || stack.slug}</p>
										</div>
										<StatusBadge status={stack.status} />
									</div>
								))
							) : (
								<div className="rounded-2xl border border-dashed border-default/20 bg-background/60 p-6 text-sm text-muted">
									No stacks assigned to this environment yet.
								</div>
							)}
						</div>
					</div>
					<div className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
						<h2 className="text-lg font-semibold tracking-tight">Recent deployments</h2>
						<div className="mt-4 space-y-3">
							{environment.deployments.length ? (
								environment.deployments.map((deployment) => (
									<div
										key={deployment.id}
										className="rounded-2xl border border-default/15 bg-background/60 p-4"
									>
										<div className="flex items-center justify-between gap-3">
											<p className="text-sm font-semibold">{deployment.stack.name}</p>
											<StatusBadge status={deployment.status} />
										</div>
										<p className="mt-2 text-xs font-mono text-muted">{deployment.version}</p>
										<p className="mt-2 text-sm text-muted">
											{deployment.summary || "Deployment in progress."}
										</p>
									</div>
								))
							) : (
								<div className="rounded-2xl border border-dashed border-default/20 bg-background/60 p-6 text-sm text-muted">
									No deployments have targeted this environment yet.
								</div>
							)}
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
