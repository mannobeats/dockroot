import Link from "next/link";
import { createProjectAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
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
				<Panel>
					<DataTable>
						<DataTableHeader>
							<tr>
								<DataTableHead>Project</DataTableHead>
								<DataTableHead>Stacks</DataTableHead>
								<DataTableHead>Status</DataTableHead>
							</tr>
						</DataTableHeader>
						<DataTableBody>
								{projects.map((project) => (
									<DataTableRow key={project.id}>
										<DataTableCell>
											<Link
												href={`/dashboard/projects/${project.id}`}
												className="font-medium transition-colors hover:text-foreground/80"
											>
												{project.name}
											</Link>
											<p className="mt-0.5 text-xs text-muted">
												{project.description || "No description"}
											</p>
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">{project.stacks.length}</DataTableCell>
										<DataTableCell>
											{project.stacks.length > 0 ? (
												<div className="flex flex-wrap gap-1.5">
													{project.stacks.slice(0, 3).map((stack) => (
														<span key={stack.id} className="inline-flex items-center gap-1 text-xs">
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
										</DataTableCell>
									</DataTableRow>
								))}
						</DataTableBody>
					</DataTable>
				</Panel>
			) : (
				<EmptyState title="No projects yet" description="Create your first project to start organizing stacks." />
			)}

			{/* Inline create form — same row layout instead of sidebar */}
			<Panel padding="md">
				<h2 className="text-sm font-semibold">Create project</h2>
				<p className="mt-1 text-xs text-muted">
					Projects organize stacks by application or service.
				</p>
				<form action={createProjectAction} className="mt-4 grid gap-4 sm:grid-cols-3">
					<Field>
						<FieldLabel htmlFor="project-name">Name</FieldLabel>
						<Input id="project-name" name="name" required placeholder="my-app" />
					</Field>
					<Field>
						<FieldLabel htmlFor="project-description">Description</FieldLabel>
						<Input
							id="project-description"
							name="description"
							placeholder="Production app with web, worker, and database stacks."
						/>
					</Field>
					<div className="flex items-end">
						<FormSubmitButton label="Create project" pendingLabel="Creating..." />
					</div>
				</form>
			</Panel>
		</div>
	);
}
