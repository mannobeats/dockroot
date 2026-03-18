import { createGitHubAppJwt, GITHUB_API_BASE, githubRequest } from "./client";
import { type GitHubProviderConfig, getRequiredGitHubProviderConfig } from "./provider";

export async function getGitHubInstallation(
	installationId: string,
	provider?: GitHubProviderConfig,
) {
	const authProvider = provider || (await getRequiredGitHubProviderConfig());
	return githubRequest<{
		id: number;
		app_slug: string;
		account: {
			login: string;
			type: string;
		};
	}>(`/app/installations/${installationId}`, { asApp: true, provider: authProvider });
}

export async function listGitHubAppInstallations(provider?: GitHubProviderConfig) {
	const authProvider = provider || (await getRequiredGitHubProviderConfig());
	return githubRequest<
		Array<{
			id: number;
			app_slug: string;
			account: {
				login: string;
				type: string;
			};
		}>
	>("/app/installations", { asApp: true, provider: authProvider });
}

export async function createInstallationAccessToken(
	installationId: string,
	provider?: GitHubProviderConfig,
) {
	const authProvider = provider || (await getRequiredGitHubProviderConfig());
	return githubRequest<{
		token: string;
		expires_at: string;
	}>(`/app/installations/${installationId}/access_tokens`, {
		method: "POST",
		asApp: true,
		provider: authProvider,
	});
}

export async function deleteGitHubAppInstallation(
	installationId: string,
	provider?: GitHubProviderConfig,
) {
	const authProvider = provider || (await getRequiredGitHubProviderConfig());
	const headers = new Headers({
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "dockroot-manager",
		Authorization: `Bearer ${await createGitHubAppJwt(authProvider)}`,
	});

	const response = await fetch(`${GITHUB_API_BASE}/app/installations/${installationId}`, {
		method: "DELETE",
		headers,
		cache: "no-store",
	});

	if (!response.ok && response.status !== 404) {
		const details = await response.text().catch(() => "");
		throw new Error(
			`GitHub installation delete failed (${response.status} ${response.statusText})${details ? `: ${details}` : ""}.`,
		);
	}
}

export async function listInstallationRepositories(
	installationId: string,
	provider?: GitHubProviderConfig,
) {
	const token = await createInstallationAccessToken(installationId, provider);

	const response = await githubRequest<{
		repositories: Array<{
			id: number;
			name: string;
			full_name: string;
			private: boolean;
			default_branch: string;
			owner: {
				login: string;
			};
		}>;
	}>("/installation/repositories?per_page=100", {
		token: token.token,
	});

	return response.repositories;
}
