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
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Projects"
				title="Projects"
				description={`${projects.length} projects — organize stacks by application or service`}
			/>

			{/* Project table — cleaner and scalable */}
			{projects.length ? (
				<div className="rounded-xl border border-default/10 bg-surface">
					<div className="table-scroll">
						<table className="min-w-full text-left text-sm">
							<thead>
								<tr className="border-b border-default/10 text-xs text-muted">
									<th className="px-4 py-3 font-medium">Project</th>
									<th className="px-4 py-3 font-medium">Stacks</th>
									<th className="px-4 py-3 font-medium">Status</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-default/5">
								{projects.map((project) => (
									<tr key={project.id} className="transition-colors hover:bg-foreground/[0.02]">
										<td className="px-4 py-3">
											<Link
												href={`/dashboard/projects/${project.id}`}
												className="font-medium transition-colors hover:text-foreground/80"
											>
												{project.name}
											</Link>
											<p className="mt-0.5 text-xs text-muted">
												{project.description || "No description"}
											</p>
										</td>
										<td className="px-4 py-3 text-xs text-muted">
											{project.stacks.length}
										</td>
										<td className="px-4 py-3">
											{project.stacks.length > 0 ? (
												<div className="flex flex-wrap gap-1.5">
													{project.stacks.slice(0, 3).map((stack) => (
														<span
															key={stack.id}
															className="inline-flex items-center gap-1 text-xs"
														>
															<span>{stack.name}</span>
															<StatusBadge status={stack.status} />
														</span>
													))}
													{project.stacks.length > 3 ? (
														<span className="text-xs text-muted">+{project.stacks.length - 3}</span>
													) : null}
												</div>
											) : (
												<span className="text-xs text-muted">No stacks</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			) : (
				<div className="rounded-xl border border-dashed border-default/10 bg-surface p-12 text-center text-sm text-muted">
					Create your first project to start organizing stacks.
				</div>
			)}

			{/* Inline create form — same row layout instead of sidebar */}
			<div className="rounded-xl border border-default/10 bg-surface p-5">
				<h2 className="text-sm font-semibold">Create project</h2>
				<p className="mt-1 text-xs text-muted">
					Projects organize stacks by application or service.
				</p>
				<form action={createProjectAction} className="mt-4 grid gap-4 sm:grid-cols-3">
					<div className="space-y-1.5">
						<label htmlFor="project-name" className="text-xs font-medium text-muted">
							Name
						</label>
						<input
							id="project-name"
							name="name"
							required
							placeholder="my-app"
							className="h-9 w-full rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
					</div>
					<div className="space-y-1.5">
						<label htmlFor="project-description" className="text-xs font-medium text-muted">
							Description
						</label>
						<input
							id="project-description"
							name="description"
							placeholder="Production app with web, worker, and database stacks."
							className="h-9 w-full rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
					</div>
					<div className="flex items-end">
						<FormSubmitButton
							label="Create project"
							pendingLabel="Creating..."
							className="inline-flex h-9 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
						/>
					</div>
				</form>
			</div>
		</div>
	);
}
