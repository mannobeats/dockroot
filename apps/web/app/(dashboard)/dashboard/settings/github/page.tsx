import { GitHubAppsPanel } from "@/components/github-apps-panel";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { isGitHubAppConfigured } from "@/lib/github-app";
import { listGitHubInstallations, listGitHubProviders } from "@/lib/platform";

export default async function GitHubSettingsPage({
	searchParams,
}: {
	searchParams: Promise<{
		github?: string;
		githubError?: string;
	}>;
}) {
	const { userId } = await requirePrivilegedPageSession();
	const params = await searchParams;

	const [githubProviders, githubInstallations] = await Promise.all([
		listGitHubProviders(userId),
		listGitHubInstallations(userId),
	]);

	const githubStatus = params.github || "";
	const githubError = params.githubError || "";

	return (
		<GitHubAppsPanel
			initialProviders={githubProviders}
			initialInstallations={githubInstallations}
			redirectTo="/dashboard/settings/github"
			initialStatus={githubStatus}
			initialError={githubError}
		/>
	);
}
