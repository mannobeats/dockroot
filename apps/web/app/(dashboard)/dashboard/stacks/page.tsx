import {
	adoptComposeProjectAction,
	bulkDestroyStacksAction,
	bulkRemoveStacksAction,
	bulkRestartStacksAction,
	bulkStopStacksAction,
	controlComposeProjectAction,
	createGitHubStackAction,
	createStackAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { GitHubAppsPanel } from "@/components/github-apps-panel";
import { PageHeader } from "@/components/page-header";
import { StackCreateModal } from "@/components/stack-create-modal";
import { StacksTableWorkspace } from "@/components/stacks-table-workspace";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { isGitHubAppConfigured } from "@/lib/github-app";
import {
	listEnvironments,
	listGitHubInstallations,
	listGitHubProviders,
	listStacks,
} from "@/lib/platform";

export default async function StacksPage({
	searchParams,
}: {
	searchParams: Promise<{
		environment?: string;
		github?: string;
		githubError?: string;
		watchStackId?: string;
	}>;
}) {
	const { userId, role } = await requireUserSession();
	const includeUntracked = isPrivilegedRole(role);
	const params = await searchParams;

	const [stacks, environments, githubInstallations, githubProviders] = await Promise.all([
		listStacks(userId, { includeUntracked }),
		listEnvironments(userId),
		listGitHubInstallations(userId),
		listGitHubProviders(userId),
	]);
	const appConfigured = await isGitHubAppConfigured();

	const trackedCount = stacks.filter((stack) => stack.type === "tracked").length;
	const runningCount = stacks.filter((stack) => stack.runningCount > 0).length;
	const githubStatus = params.github || "";
	const githubError = params.githubError || "";

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Stacks"
				description={`${stacks.length} stacks · ${trackedCount} tracked · ${runningCount} active`}
				actions={
					<StackCreateModal
						environments={environments.map((environment) => ({
							id: environment.id,
							name: environment.name,
							kind: environment.kind,
						}))}
						installations={githubInstallations}
						providers={githubProviders}
						appConfigured={appConfigured}
						createStackAction={createStackAction}
						createGitHubStackAction={createGitHubStackAction}
					/>
				}
			/>

			<GitHubAppsPanel
				initialProviders={githubProviders}
				initialInstallations={githubInstallations}
				redirectTo="/dashboard/stacks"
				initialStatus={githubStatus}
				initialError={githubError}
			/>

			<StacksTableWorkspace
				stacks={stacks}
				includeUntracked={includeUntracked}
				environmentId={params.environment}
				initialWatchStackId={params.watchStackId}
				deployStackAction={deployStackAction}
				destroyStackAction={destroyStackAction}
				adoptComposeProjectAction={adoptComposeProjectAction}
				controlComposeProjectAction={controlComposeProjectAction}
				bulkRestartStacksAction={bulkRestartStacksAction}
				bulkStopStacksAction={bulkStopStacksAction}
				bulkDestroyStacksAction={bulkDestroyStacksAction}
				bulkRemoveStacksAction={bulkRemoveStacksAction}
			/>
		</div>
	);
}
