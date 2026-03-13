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
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { isGitHubAppConfigured } from "@/lib/github-app";
import { listEnvironments, listGitHubInstallations, listGitHubProviders, listStacks } from "@/lib/platform";

export default async function StacksPage({
	searchParams,
}: {
	searchParams: Promise<{ environment?: string; github?: string; githubError?: string }>;
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
	const untrackedCount = stacks.filter((stack) => stack.type === "untracked").length;
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
						providers={githubProviders}
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

			<div className="rounded-xl border border-default/10 bg-background/30 p-4">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold">GitHub Apps</p>
					<Badge className="text-xs">{githubProviders.length} configured</Badge>
				</div>
				<div className="mt-3 space-y-2">
					{githubProviders.length ? (
						githubProviders.map((provider) => (
							<div
								key={provider.id}
								className="flex items-center justify-between rounded-lg border border-default/10 px-3 py-2 text-xs"
							>
								<div>
									<p className="font-medium">{provider.name}</p>
									<p className="text-muted">{provider.appSlug}</p>
								</div>
								<Badge className="text-[10px]">
									{providerInstallCount.get(provider.id) || 0} installations
								</Badge>
							</div>
						))
					) : (
						<p className="text-xs text-muted">
							No GitHub Apps found in Dockroot yet. Use From GitHub to create one.
						</p>
					)}
				</div>
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
