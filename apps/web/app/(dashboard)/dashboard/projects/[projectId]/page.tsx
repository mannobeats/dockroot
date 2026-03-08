import { ArrowLeft } from "lucide-react";
import {
	createGitHubStackAction,
	createStackAction,
	deleteProjectAction,
	deleteStackAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { ProjectDetailTabs } from "@/components/project-detail-tabs";
import { LinkButton } from "@/components/ui/link-button";
import { MetricCard } from "@/components/ui/metric-card";
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

	const envList = environments.map((e) => ({
		id: e.id,
		name: e.name,
		kind: e.kind,
	}));

	return (
		<div className="animate-in space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<LinkButton href="/dashboard/projects" variant="outline" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</LinkButton>
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">
							Project
						</p>
						<h1 className="text-lg font-semibold">{project.name}</h1>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<form action={deleteProjectAction}>
						<input type="hidden" name="projectId" value={project.id} />
						<FormSubmitButton label="Delete project" pendingLabel="Deleting..." variant="danger" size="xs" />
					</form>
				</div>
			</div>

			{/* Summary stats */}
			<div className="grid gap-3 sm:grid-cols-3">
				<MetricCard label="Stacks" value={project.stacks.length} />
				<MetricCard label="GitHub Access" value={githubInstallations.length} />
				<MetricCard label="Environments" value={environments.length} />
			</div>

			{/* Tabbed interface: Stacks | Deploy GitHub | Deploy Manual */}
			<ProjectDetailTabs
				project={project}
				environments={envList}
				githubInstallations={githubInstallations}
				appConfigured={isGitHubAppConfigured()}
				createGitHubStackAction={createGitHubStackAction}
				createStackAction={createStackAction}
				deployStackAction={deployStackAction}
				destroyStackAction={destroyStackAction}
				deleteStackAction={deleteStackAction}
			/>
		</div>
	);
}
