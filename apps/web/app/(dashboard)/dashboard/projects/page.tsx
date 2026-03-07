import Link from "next/link";
import { createProjectAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { listProjects } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function ProjectsPage() {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const projects = await listProjects(session.user.id);

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Projects"
				title="Compose-native application projects"
				description="Each project groups one or more stacks. Stacks can be deployed manually with Docker Compose now, and GitHub App sources can attach here next without changing the information architecture."
			/>

			<div className="grid gap-5 xl:grid-cols-[1fr_360px]">
				<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold tracking-tight">All projects</h2>
						<span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
							{projects.length} total
						</span>
					</div>
					<div className="mt-5 space-y-4">
						{projects.length ? (
							projects.map((project) => (
								<Link
									key={project.id}
									href={`/dashboard/projects/${project.id}`}
									className="block rounded-[24px] border border-default/15 bg-background/60 p-5 transition-colors hover:border-accent/30"
								>
									<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
										<div>
											<h3 className="text-lg font-semibold">{project.name}</h3>
											<p className="mt-1 text-sm text-muted">
												{project.description || "No project description yet."}
											</p>
										</div>
										<div className="flex flex-wrap gap-2">
											<span className="rounded-full bg-default/10 px-3 py-1 text-xs font-medium text-muted">
												{project.stacks.length} stacks
											</span>
										</div>
									</div>
									<div className="mt-4 flex flex-wrap gap-2">
										{project.stacks.slice(0, 4).map((stack) => (
											<div
												key={stack.id}
												className="flex items-center gap-2 rounded-full border border-default/15 bg-surface px-3 py-1.5 text-xs"
											>
												<span>{stack.name}</span>
												<StatusBadge status={stack.status} />
											</div>
										))}
										{project.stacks.length === 0 ? (
											<span className="text-sm text-muted">No stacks yet.</span>
										) : null}
									</div>
								</Link>
							))
						) : (
							<div className="rounded-[24px] border border-dashed border-default/20 bg-background/60 p-8 text-sm text-muted">
								Create your first project to organize stacks by application, client, or product
								surface.
							</div>
						)}
					</div>
				</section>

				<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
					<h2 className="text-lg font-semibold tracking-tight">Create project</h2>
					<p className="mt-1 text-sm text-muted">
						Projects are the parent container for stacks, deploys, logs, and future GitHub App
						sources.
					</p>
					<form action={createProjectAction} className="mt-5 space-y-4">
						<div className="space-y-1.5">
							<label htmlFor="project-name" className="text-sm font-medium">
								Project name
							</label>
							<input
								id="project-name"
								name="name"
								required
								placeholder="Customer portal"
								className="h-11 w-full rounded-2xl border border-default/15 bg-background px-4 text-sm outline-none ring-0 transition-colors focus:border-accent"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="project-description" className="text-sm font-medium">
								Description
							</label>
							<textarea
								id="project-description"
								name="description"
								rows={4}
								placeholder="Production app with web, worker, and database stacks."
								className="w-full rounded-2xl border border-default/15 bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent"
							/>
						</div>
						<FormSubmitButton label="Create project" pendingLabel="Creating project..." />
					</form>
				</section>
			</div>
		</div>
	);
}
