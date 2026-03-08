import { Plus } from "lucide-react";
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

			<div className="grid gap-6 xl:grid-cols-[1fr_380px]">
				{/* Project List */}
				<div className="space-y-3">
					{projects.length ? (
						projects.map((project) => (
							<Link
								key={project.id}
								href={`/dashboard/projects/${project.id}`}
								className="block rounded-xl border border-default/10 bg-surface p-5 transition-all hover:border-default/20 hover:shadow-sm"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<h3 className="text-base font-semibold">{project.name}</h3>
										<p className="mt-1 text-sm text-muted">
											{project.description || "No description"}
										</p>
									</div>
									<span className="shrink-0 rounded-md bg-foreground/[0.04] px-2 py-1 text-xs font-medium text-muted">
										{project.stacks.length} stacks
									</span>
								</div>
								{project.stacks.length > 0 ? (
									<div className="mt-3 flex flex-wrap gap-2">
										{project.stacks.slice(0, 4).map((stack) => (
											<div
												key={stack.id}
												className="flex items-center gap-1.5 rounded-md border border-default/10 bg-foreground/[0.02] px-2.5 py-1 text-xs"
											>
												<span>{stack.name}</span>
												<StatusBadge status={stack.status} />
											</div>
										))}
										{project.stacks.length > 4 ? (
											<span className="rounded-md bg-foreground/[0.04] px-2 py-1 text-xs text-muted">
												+{project.stacks.length - 4} more
											</span>
										) : null}
									</div>
								) : null}
							</Link>
						))
					) : (
						<div className="rounded-xl border border-dashed border-default/10 p-12 text-center text-sm text-muted">
							Create your first project to start organizing stacks.
						</div>
					)}
				</div>

				{/* Create Project Form */}
				<div className="rounded-xl border border-default/10 bg-surface p-5">
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04]">
							<Plus className="h-4 w-4 text-muted" />
						</div>
						<h2 className="text-sm font-semibold">New project</h2>
					</div>
					<form action={createProjectAction} className="mt-4 space-y-4">
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
							<textarea
								id="project-description"
								name="description"
								rows={3}
								placeholder="Production app with web, worker, and database stacks."
								className="w-full rounded-lg border border-default/10 bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
							/>
						</div>
						<FormSubmitButton
							label="Create project"
							pendingLabel="Creating..."
							className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
						/>
					</form>
				</div>
			</div>
		</div>
	);
}
