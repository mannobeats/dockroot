import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
					<Link
						href="/dashboard/projects"
						className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-default/10 text-muted transition-colors hover:text-foreground"
					>
						<ArrowLeft className="h-4 w-4" />
					</Link>
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
						<FormSubmitButton
							label="Delete project"
							pendingLabel="Deleting..."
							className="inline-flex h-7 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
						/>
					</form>
				</div>
			</div>

			{/* Summary stats */}
			<div className="grid gap-3 sm:grid-cols-3">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Stacks</p>
					<p className="mt-1 text-2xl font-semibold">{project.stacks.length}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">GitHub Access</p>
					<p className="mt-1 text-2xl font-semibold">{githubInstallations.length}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Environments</p>
					<p className="mt-1 text-2xl font-semibold">{environments.length}</p>
				</div>
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
