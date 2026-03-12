import {
	adoptComposeProjectAction,
	controlComposeProjectAction,
	createGitHubStackAction,
	createStackAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { PageHeader } from "@/components/page-header";
import { StackCreateModal } from "@/components/stack-create-modal";
import { StacksTableWorkspace } from "@/components/stacks-table-workspace";
import { MetricCard } from "@/components/ui/metric-card";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { isGitHubAppConfigured } from "@/lib/github-app";
import { listEnvironments, listGitHubInstallations, listStacks } from "@/lib/platform";

export default async function StacksPage({
	searchParams,
}: {
	searchParams: Promise<{ environment?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const includeUntracked = isPrivilegedRole(role);
	const params = await searchParams;

	const [stacks, environments, githubInstallations] = await Promise.all([
		listStacks(userId, { includeUntracked }),
		listEnvironments(userId),
		listGitHubInstallations(userId),
	]);
	const appConfigured = await isGitHubAppConfigured();

	const trackedCount = stacks.filter((stack) => stack.type === "tracked").length;
	const untrackedCount = stacks.filter((stack) => stack.type === "untracked").length;
	const runningCount = stacks.filter((stack) => stack.runningCount > 0).length;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Operations"
				title="Stacks"
				description={`${stacks.length} compose stacks across all environments`}
				actions={
					<StackCreateModal
						environments={environments.map((environment) => ({
							id: environment.id,
							name: environment.name,
							kind: environment.kind,
						}))}
						installations={githubInstallations}
						appConfigured={appConfigured}
						createStackAction={createStackAction}
						createGitHubStackAction={createGitHubStackAction}
					/>
				}
			/>

			<div className="grid gap-4 sm:grid-cols-3">
				<MetricCard label="Stacks" value={stacks.length} description="Visible after filters" />
				<MetricCard label="Tracked" value={trackedCount} description="Managed by Dockroot" />
				<MetricCard
					label="Active"
					value={runningCount}
					description={`${untrackedCount} untracked compose stacks`}
				/>
			</div>

			<StacksTableWorkspace
				stacks={stacks}
				includeUntracked={includeUntracked}
				environmentId={params.environment}
				deployStackAction={deployStackAction}
				destroyStackAction={destroyStackAction}
				adoptComposeProjectAction={adoptComposeProjectAction}
				controlComposeProjectAction={controlComposeProjectAction}
			/>
		</div>
	);
}
