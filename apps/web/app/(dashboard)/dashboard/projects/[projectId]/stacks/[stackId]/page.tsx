import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
	controlContainerAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { CodeEditor } from "@/components/code-editor";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveStackFeed } from "@/components/live-stack-feed";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getStackById } from "@/lib/platform";
import { getContainerDetails, listStackContainers } from "@/lib/platform/docker";
import { getServerSession } from "@/lib/session";

export default async function StackWorkspacePage({
	params,
}: {
	params: Promise<{ projectId: string; stackId: string }>;
}) {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const { projectId, stackId } = await params;
	const stack = await getStackById({
		stackId,
		projectId,
		userId: session.user.id,
	});

	if (!stack) {
		return <div className="text-sm text-muted">Stack not found.</div>;
	}

	const containers = await listStackContainers(stack.slug);
	const firstContainer = containers[0];
	const details = firstContainer ? await getContainerDetails(firstContainer.ID) : null;
	const latestDeployment = stack.deployments[0];

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Stack Workspace"
				title={stack.name}
				description={
					stack.description ||
					"Compose source, env file, runtime containers, and live deployment logs."
				}
				actions={
					<>
						<Link
							href={`/dashboard/projects/${projectId}`}
							className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to project
						</Link>
						<form action={deployStackAction}>
							<input type="hidden" name="stackId" value={stack.id} />
							<FormSubmitButton label="Deploy" pendingLabel="Deploying..." />
						</form>
						<form action={destroyStackAction}>
							<input type="hidden" name="stackId" value={stack.id} />
							<FormSubmitButton
								label="Destroy"
								pendingLabel="Destroying..."
								className="inline-flex h-11 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-60"
							/>
						</form>
					</>
				}
			/>

			<div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
				<section className="space-y-5">
					<div className="rounded-2xl border border-default/15 bg-surface p-5">
						<div className="flex items-center justify-between">
							<h2 className="text-lg font-semibold tracking-tight">Source files</h2>
							<StatusBadge status={stack.status} />
						</div>
						<div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
							<span>Source: {stack.sourceType === "github" ? "GitHub App" : "Manual Compose"}</span>
							{stack.sourceType === "github" && stack.githubOwner && stack.githubRepository ? (
								<span>
									Repository: {stack.githubOwner}/{stack.githubRepository}
								</span>
							) : null}
							{stack.sourceType === "github" && stack.githubBranch ? (
								<span>Branch: {stack.githubBranch}</span>
							) : null}
						</div>
						<div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_0.75fr]">
							<div className="overflow-hidden rounded-xl border border-default/15">
								<div className="border-b border-default/10 px-4 py-3">
									<p className="text-sm font-semibold">{stack.composeFileName}</p>
								</div>
								<CodeEditor value={stack.composeYaml} language="yaml" readOnly minHeight="420px" />
							</div>
							<div className="overflow-hidden rounded-xl border border-default/15">
								<div className="border-b border-default/10 px-4 py-3">
									<p className="text-sm font-semibold">{stack.envFileName || ".env"}</p>
								</div>
								<CodeEditor
									value={stack.envFileContent || "# No env file configured"}
									language="env"
									readOnly
									minHeight="420px"
								/>
							</div>
						</div>
					</div>

					<div className="rounded-2xl border border-default/15 bg-surface p-5">
						<h2 className="text-lg font-semibold tracking-tight">Runtime containers</h2>
						<div className="mt-4 space-y-3">
							{containers.length ? (
								containers.map((container) => (
									<div
										key={`${container.ID}-${container.Names}`}
										className="rounded-xl border border-default/15 bg-background/60 px-4 py-3"
									>
										<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
											<div>
												<div className="flex items-center gap-2">
													<p className="text-sm font-semibold">{container.Names}</p>
													<StatusBadge status={(container.State || "offline").toLowerCase()} />
												</div>
												<p className="mt-1 text-sm text-muted">{container.Image}</p>
											</div>
											<div className="flex flex-wrap gap-2">
												{(["start", "stop", "restart"] as const).map((action) => (
													<form key={action} action={controlContainerAction}>
														<input type="hidden" name="containerId" value={container.ID} />
														<input type="hidden" name="action" value={action} />
														<FormSubmitButton
															label={action}
															pendingLabel={`${action}ing...`}
															className="inline-flex h-9 items-center justify-center rounded-lg border border-default/20 bg-surface px-3 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
														/>
													</form>
												))}
											</div>
										</div>
									</div>
								))
							) : (
								<div className="rounded-xl border border-dashed border-default/20 bg-background/60 p-6 text-sm text-muted">
									No runtime containers found for this stack yet.
								</div>
							)}
						</div>
					</div>
				</section>

				<section className="space-y-5">
					<LiveStackFeed stackId={stack.id} initialLog={latestDeployment?.log} />

					<div className="rounded-2xl border border-default/15 bg-surface p-5">
						<h2 className="text-lg font-semibold tracking-tight">Container details</h2>
						{details?.inspect ? (
							<div className="mt-4 space-y-4">
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="rounded-xl border border-default/15 bg-background/60 p-4">
										<p className="text-xs text-muted">Container ID</p>
										<p className="mt-2 break-all text-sm font-medium">{details.inspect.Id}</p>
									</div>
									<div className="rounded-xl border border-default/15 bg-background/60 p-4">
										<p className="text-xs text-muted">Created</p>
										<p className="mt-2 text-sm font-medium">{details.inspect.Created}</p>
									</div>
								</div>
								<pre className="max-h-[260px] overflow-auto rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/80">
									{details.logs || "No container logs yet."}
								</pre>
							</div>
						) : (
							<div className="mt-4 rounded-xl border border-dashed border-default/20 bg-background/60 p-6 text-sm text-muted">
								Container details will appear after the stack has started.
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
