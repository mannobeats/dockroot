import { GITHUB_API_BASE } from "./client";
import {
	type GitHubProviderConfig,
	getGitHubProviderConfigById,
	getRequiredGitHubProviderConfig,
} from "./provider";
import { encodeBase64Url } from "./state";

export async function getGitHubAppInstallUrl(state: string, providerId?: string | null) {
	const provider =
		(providerId ? await getGitHubProviderConfigById(providerId) : null) ||
		(await getRequiredGitHubProviderConfig());
	return `https://github.com/apps/${provider.appSlug}/installations/new?state=${encodeURIComponent(state)}`;
}

export async function exchangeGitHubManifestCode(code: string) {
	const response = await fetch(
		`${GITHUB_API_BASE}/app-manifests/${encodeURIComponent(code)}/conversions`,
		{
			method: "POST",
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "dockroot-manager",
			},
			cache: "no-store",
		},
	);

	if (!response.ok) {
		const details = await response.text().catch(() => "");
		throw new Error(
			`GitHub app manifest conversion failed (${response.status} ${response.statusText})${details ? `: ${details}` : ""}.`,
		);
	}

	return (await response.json()) as {
		id: number;
		slug: string;
		client_id?: string;
		client_secret?: string;
		pem: string;
		webhook_secret?: string | null;
	};
}

export { encodeBase64Url };
export type { GitHubProviderConfig };
