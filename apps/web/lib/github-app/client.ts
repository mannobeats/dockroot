import crypto from "node:crypto";
import type { GitHubProviderConfig } from "@/lib/github-app-provider";
import { getRequiredGitHubProviderConfig } from "@/lib/github-app-provider";
import { encodeBase64Url } from "@/lib/github-app-state";

export const GITHUB_API_BASE = "https://api.github.com";

export async function createGitHubAppJwt(providerInput?: GitHubProviderConfig) {
	const provider = providerInput || (await getRequiredGitHubProviderConfig());
	const issuedAt = Math.floor(Date.now() / 1000) - 60;
	const expiresAt = issuedAt + 9 * 60;
	const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = encodeBase64Url(
		JSON.stringify({
			iat: issuedAt,
			exp: expiresAt,
			iss: provider.appId,
		}),
	);
	const signer = crypto.createSign("RSA-SHA256");
	signer.update(`${header}.${payload}`);
	signer.end();
	const signature = signer.sign(provider.privateKey);

	return `${header}.${payload}.${encodeBase64Url(signature)}`;
}

export async function githubRequest<T>(
	path: string,
	init: RequestInit & {
		token?: string;
		asApp?: boolean;
		provider?: GitHubProviderConfig;
	} = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/vnd.github+json");
	headers.set("X-GitHub-Api-Version", "2022-11-28");
	headers.set("User-Agent", "dockroot-manager");

	if (init.asApp) {
		headers.set("Authorization", `Bearer ${await createGitHubAppJwt(init.provider)}`);
	} else if (init.token) {
		headers.set("Authorization", `Bearer ${init.token}`);
	}

	const response = await fetch(`${GITHUB_API_BASE}${path}`, {
		...init,
		headers,
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(
			`GitHub API request failed (${response.status} ${response.statusText}) for ${path}`,
		);
	}

	return (await response.json()) as T;
}
