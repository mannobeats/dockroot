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
import { PageHeader } from "@/components/page-header";
import { StackCreateModal } from "@/components/stack-create-modal";
import { StacksTableWorkspace } from "@/components/stacks-table-workspace";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
	const providerInstallCount = new Map<string, number>();
	for (const installation of githubInstallations) {
		const providerId = installation.providerId || "";
		if (!providerId) {
			continue;
		}
		providerInstallCount.set(providerId, (providerInstallCount.get(providerId) || 0) + 1);
	}

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

			{githubStatus ? (
				<Alert>
					{githubStatus === "manifest-ready"
						? "GitHub App created. Next step: install it, then refresh providers."
						: githubStatus === "connected"
							? "GitHub installation connected."
							: `GitHub setup status: ${githubStatus}`}
					{githubError ? ` (${githubError})` : ""}
				</Alert>
			) : null}

			{/* GitHub Apps — compact inline */}
			{githubProviders.length ? (
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span className="font-medium text-muted">GitHub:</span>
					{githubProviders.map((provider) => (
						<Badge key={provider.id}>
							{provider.name} · {providerInstallCount.get(provider.id) || 0} installs
						</Badge>
					))}
				</div>
			) : null}

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
