import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
	createGitHubStackAction,
	createStackAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StackComposeForm } from "@/components/stack-compose-form";
import { StackGitHubForm } from "@/components/stack-github-form";
import { StatusBadge } from "@/components/status-badge";
import { isGitHubAppConfigured } from "@/lib/github-app";
import { getProjectById, listEnvironments, listGitHubInstallations } from "@/lib/platform";
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
	const [project, environments, githubInstallations] = await Promise.all([
		getProjectById(projectId, session.user.id),
		listEnvironments(session.user.id),
		listGitHubInstallations(session.user.id),
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
					"Stacks, env files, deploy history, and runtime inspection all live inside the project workspace."
				}
				actions={
					<Link
						href="/dashboard/projects"
						className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
					>
						Back to projects
					</Link>
				}
			/>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="grid gap-4 md:grid-cols-3">
					<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
							Stacks
						</p>
						<p className="mt-3 text-3xl font-semibold tracking-tight">{project.stacks.length}</p>
						<p className="mt-2 text-sm text-muted">
							Deployable compose workspaces tied to this project.
						</p>
					</div>
					<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
							GitHub Access
						</p>
						<p className="mt-3 text-3xl font-semibold tracking-tight">
							{githubInstallations.length}
						</p>
						<p className="mt-2 text-sm text-muted">
							Connected GitHub App installations available for repo-backed stacks.
						</p>
					</div>
					<div className="rounded-2xl border border-default/15 bg-background/60 p-4">
						<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
							Environments
						</p>
						<p className="mt-3 text-3xl font-semibold tracking-tight">{environments.length}</p>
						<p className="mt-2 text-sm text-muted">
							Available deployment targets for this project.
						</p>
					</div>
				</div>
			</section>

			<section className="space-y-5">
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
						<div>
							<h2 className="text-lg font-semibold tracking-tight">Create GitHub stack</h2>
							<p className="mt-1 text-sm text-muted">
								Search connected repositories, choose a compose path, then load the source into the
								editor before you save the stack.
							</p>
						</div>
						<div className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
							Recommended workflow
						</div>
					</div>
					<StackGitHubForm
						projectId={project.id}
						environments={environments.map((environment) => ({
							id: environment.id,
							name: environment.name,
							kind: environment.kind,
						}))}
						installations={githubInstallations}
						redirectTo={`/dashboard/projects/${project.id}`}
						appConfigured={isGitHubAppConfigured()}
						action={createGitHubStackAction}
					/>
				</div>

				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="mb-4">
						<h2 className="text-lg font-semibold tracking-tight">Create compose stack manually</h2>
						<p className="mt-1 text-sm text-muted">
							Paste compose and env content directly when you are not pulling from GitHub.
						</p>
					</div>
					<StackComposeForm
						projectId={project.id}
						environments={environments.map((environment) => ({
							id: environment.id,
							name: environment.name,
							kind: environment.kind,
						}))}
						action={createStackAction}
					/>
				</div>
			</section>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 className="text-lg font-semibold tracking-tight">Stacks</h2>
						<p className="mt-1 text-sm text-muted">
							Deploy, destroy, and inspect the stacks already attached to this project.
						</p>
					</div>
					<span className="rounded-full bg-default/10 px-3 py-1 text-xs font-semibold text-muted">
						{project.stacks.length} total
					</span>
				</div>
				<div className="mt-5 grid gap-4 xl:grid-cols-2">
					{project.stacks.length ? (
						project.stacks.map((stack) => (
							<div
								key={stack.id}
								className="rounded-xl border border-default/15 bg-background/50 p-4"
							>
								<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<h3 className="text-base font-semibold">{stack.name}</h3>
											<StatusBadge status={stack.status} />
										</div>
										<p className="mt-1 text-sm text-muted">
											{stack.description || "No stack description yet."}
										</p>
										<div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
											<span>Environment: {stack.environment.name}</span>
											<span>Slug: {stack.slug}</span>
											<span>
												Source: {stack.sourceType === "github" ? "GitHub App" : "Manual Compose"}
											</span>
											<span>{stack.envFileContent ? "Env file configured" : "No env file"}</span>
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

								<div className="mt-4 grid gap-3 sm:grid-cols-2">
									<div className="rounded-xl border border-default/15 bg-surface/70 p-3">
										<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
											Last deployments
										</p>
										<div className="mt-3 space-y-2">
											{stack.deployments.length ? (
												stack.deployments.slice(0, 3).map((deployment) => (
													<div
														key={deployment.id}
														className="rounded-lg bg-background/60 px-3 py-2"
													>
														<div className="flex items-center justify-between gap-2">
															<p className="font-mono text-[11px] text-muted">
																{deployment.version}
															</p>
															<StatusBadge status={deployment.status} />
														</div>
													</div>
												))
											) : (
												<p className="text-sm text-muted">No deployments yet.</p>
											)}
										</div>
									</div>
									<div className="rounded-xl border border-default/15 bg-surface/70 p-3">
										<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
											Files
										</p>
										<div className="mt-3 space-y-2 text-sm text-muted">
											<p>{stack.composeFileName}</p>
											<p>{stack.envFileName || ".env"}</p>
											{stack.sourceType === "github" &&
											stack.githubOwner &&
											stack.githubRepository ? (
												<p>
													{stack.githubOwner}/{stack.githubRepository}
												</p>
											) : null}
										</div>
									</div>
								</div>

								<div className="mt-4">
									<Link
										href={`/dashboard/projects/${project.id}/stacks/${stack.id}`}
										className="inline-flex items-center text-sm font-medium text-accent"
									>
										Open stack workspace
										<ArrowRight className="ml-2 h-4 w-4" />
									</Link>
								</div>
							</div>
						))
					) : (
						<div className="rounded-xl border border-dashed border-default/20 bg-background/60 p-8 text-sm text-muted xl:col-span-2">
							This project has no stacks yet. Start with GitHub above or create a manual compose
							stack.
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
