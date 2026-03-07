import Link from "next/link";
import {
	createStackAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getProjectById, listEnvironments } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function ProjectDetailPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const { projectId } = await params;
	const [project, environments] = await Promise.all([
		getProjectById(projectId, session.user.id),
		listEnvironments(session.user.id),
	]);

	if (!project) {
		return <div className="text-sm text-muted">Project not found.</div>;
	}

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Project"
				title={project.name}
				description={
					project.description ||
					"Compose stacks, deployment history, and environment targeting all live here."
				}
				actions={
					<Link
						href="/dashboard/projects"
						className="inline-flex h-11 items-center justify-center rounded-2xl border border-default/15 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
					>
						Back to projects
					</Link>
				}
			/>

			<div className="grid gap-5 xl:grid-cols-[1fr_380px]">
				<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold tracking-tight">Stacks</h2>
						<span className="rounded-full bg-default/10 px-3 py-1 text-xs font-semibold text-muted">
							{project.stacks.length} total
						</span>
					</div>
					<div className="mt-5 space-y-4">
						{project.stacks.length ? (
							project.stacks.map((stack) => (
								<div
									key={stack.id}
									className="rounded-[24px] border border-default/15 bg-background/60 p-5"
								>
									<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
										<div className="space-y-2">
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="text-lg font-semibold">{stack.name}</h3>
												<StatusBadge status={stack.status} />
											</div>
											<p className="text-sm text-muted">
												{stack.description || "No stack description yet."}
											</p>
											<div className="flex flex-wrap gap-3 text-sm text-muted">
												<span>Environment: {stack.environment.name}</span>
												<span>Source: {stack.sourceType}</span>
												<span>Slug: {stack.slug}</span>
											</div>
										</div>
										<div className="flex flex-wrap gap-2">
											<form action={deployStackAction}>
												<input type="hidden" name="stackId" value={stack.id} />
												<FormSubmitButton
													label="Deploy"
													pendingLabel="Deploying..."
													className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
												/>
											</form>
											<form action={destroyStackAction}>
												<input type="hidden" name="stackId" value={stack.id} />
												<FormSubmitButton
													label="Destroy"
													pendingLabel="Destroying..."
													className="inline-flex h-10 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-60"
												/>
											</form>
										</div>
									</div>

									<div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
										<div className="rounded-2xl border border-default/15 bg-surface/50 p-4">
											<p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
												Compose file
											</p>
											<pre className="mt-3 max-h-72 overflow-auto rounded-2xl bg-[#050914] p-4 text-xs leading-6 text-white/80">
												{stack.composeYaml}
											</pre>
										</div>
										<div className="rounded-2xl border border-default/15 bg-surface/50 p-4">
											<p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
												Recent deployments
											</p>
											<div className="mt-3 space-y-3">
												{stack.deployments.length ? (
													stack.deployments.map((deployment) => (
														<div
															key={deployment.id}
															className="rounded-2xl border border-default/15 bg-background/70 p-3"
														>
															<div className="flex items-center justify-between gap-3">
																<p className="font-mono text-xs text-muted">{deployment.version}</p>
																<StatusBadge status={deployment.status} />
															</div>
															<p className="mt-2 text-sm text-muted">
																{deployment.summary || "Waiting for result."}
															</p>
														</div>
													))
												) : (
													<div className="rounded-2xl border border-dashed border-default/20 bg-background/70 p-4 text-sm text-muted">
														No deployments yet.
													</div>
												)}
											</div>
										</div>
									</div>
								</div>
							))
						) : (
							<div className="rounded-[24px] border border-dashed border-default/20 bg-background/60 p-8 text-sm text-muted">
								This project has no stacks yet. Create one from the form on the right.
							</div>
						)}
					</div>
				</section>

				<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
					<h2 className="text-lg font-semibold tracking-tight">Add stack</h2>
					<p className="mt-1 text-sm text-muted">
						V1 supports manual Docker Compose v2 sources. GitHub App fields already map into the
						same stack model.
					</p>
					<form action={createStackAction} className="mt-5 space-y-4">
						<input type="hidden" name="projectId" value={project.id} />
						<div className="space-y-1.5">
							<label htmlFor="stack-name" className="text-sm font-medium">
								Stack name
							</label>
							<input
								id="stack-name"
								name="name"
								required
								placeholder="web-production"
								className="h-11 w-full rounded-2xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="environmentId" className="text-sm font-medium">
								Target environment
							</label>
							<select
								id="environmentId"
								name="environmentId"
								required
								className="h-11 w-full rounded-2xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
							>
								{environments.map((environment) => (
									<option key={environment.id} value={environment.id}>
										{environment.name} ({environment.kind})
									</option>
								))}
							</select>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="stack-description" className="text-sm font-medium">
								Description
							</label>
							<input
								id="stack-description"
								name="description"
								placeholder="Frontend + API + worker"
								className="h-11 w-full rounded-2xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="composeYaml" className="text-sm font-medium">
								Compose YAML
							</label>
							<textarea
								id="composeYaml"
								name="composeYaml"
								required
								rows={16}
								defaultValue={`services:\n  app:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n`}
								className="w-full rounded-2xl border border-default/15 bg-[#050914] px-4 py-3 font-mono text-xs leading-6 text-white outline-none transition-colors focus:border-accent"
							/>
						</div>
						<FormSubmitButton label="Create stack" pendingLabel="Creating stack..." />
					</form>
				</section>
			</div>
		</div>
	);
}
