import "server-only";

import crypto from "node:crypto";
import type { GitHubProviderConfig } from "@/lib/github-app-provider";
import {
	getGitHubProviderConfigById,
	getRequiredGitHubProviderConfig,
	listGitHubProviderConfigs,
} from "@/lib/github-app-provider";
import { encodeBase64Url } from "@/lib/github-app-state";

export type { GitHubProviderConfig } from "@/lib/github-app-provider";
export {
	getActiveGitHubProviderConfig,
	getGitHubProviderConfigById,
	getInstallationProviderConfigByGitHubInstallationId,
	getInstallationProviderConfigByInternalInstallationId,
	isGitHubAppConfigured,
	listGitHubProviderConfigs,
	upsertGitHubProviderFromManifest,
} from "@/lib/github-app-provider";
export {
	signGitHubAppState,
	signGitHubManifestState,
	verifyGitHubAppState,
} from "@/lib/github-app-state";

const GITHUB_API_BASE = "https://api.github.com";

async function githubRequest<T>(
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

export async function getGitHubAppInstallUrl(state: string, providerId?: string | null) {
	const provider =
		(providerId ? await getGitHubProviderConfigById(providerId) : null) ||
		(await getRequiredGitHubProviderConfig());
	return `https://github.com/apps/${provider.appSlug}/installations/new?state=${encodeURIComponent(state)}`;
}

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

export async function fetchRepositoryTextFile(input: {
	installationId: string;
	owner: string;
	repository: string;
	path: string;
	ref?: string | null;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const refQuery = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : "";
	const response = await githubRequest<{
		content: string;
		encoding: string;
		sha: string;
	}>(`/repos/${input.owner}/${input.repository}/contents/${input.path}${refQuery}`, {
		token: token.token,
	});

	if (response.encoding !== "base64") {
		throw new Error(`Unsupported GitHub content encoding: ${response.encoding}`);
	}

	return {
		text: Buffer.from(response.content.replace(/\n/g, ""), "base64").toString("utf8"),
		sha: response.sha,
	};
}

export async function downloadRepositoryTarball(input: {
	installationId: string;
	owner: string;
	repository: string;
	ref: string;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const response = await fetch(
		`${GITHUB_API_BASE}/repos/${input.owner}/${input.repository}/tarball/${encodeURIComponent(input.ref)}`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token.token}`,
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "dockroot-manager",
			},
			redirect: "follow",
			cache: "no-store",
		},
	);

	if (!response.ok) {
		throw new Error(
			`GitHub archive download failed (${response.status} ${response.statusText}) for ${input.owner}/${input.repository}@${input.ref}`,
		);
	}

	const contentLength = Number(response.headers.get("content-length") || "0");
	const maxArchiveBytes = 250 * 1024 * 1024;
	if (contentLength > maxArchiveBytes) {
		throw new Error("GitHub source archive exceeds the 250 MB download limit.");
	}

	const archive = Buffer.from(await response.arrayBuffer());
	if (archive.byteLength > maxArchiveBytes) {
		throw new Error("GitHub source archive exceeds the 250 MB in-memory limit.");
	}

	return archive;
}

export async function getRepositoryBranchHeadSha(input: {
	installationId: string;
	owner: string;
	repository: string;
	branch: string;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const response = await githubRequest<{
		commit: {
			sha: string;
		};
	}>(`/repos/${input.owner}/${input.repository}/branches/${encodeURIComponent(input.branch)}`, {
		token: token.token,
	});

	return response.commit.sha;
}

export async function listRepositoryTreePaths(input: {
	installationId: string;
	owner: string;
	repository: string;
	branch: string;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const response = await githubRequest<{
		tree: Array<{
			path: string;
			type: string;
		}>;
	}>(
		`/repos/${input.owner}/${input.repository}/git/trees/${encodeURIComponent(input.branch)}?recursive=1`,
		{
			token: token.token,
		},
	);

	return response.tree;
}

export async function listChangedFilesForCompare(input: {
	installationId: string;
	owner: string;
	repository: string;
	base: string;
	head: string;
	provider?: GitHubProviderConfig;
}) {
	const token = await createInstallationAccessToken(input.installationId, input.provider);
	const response = await githubRequest<{
		files?: Array<{ filename: string }>;
	}>(
		`/repos/${input.owner}/${input.repository}/compare/${encodeURIComponent(input.base)}...${encodeURIComponent(input.head)}`,
		{ token: token.token },
	);

	return (response.files || []).map((file) => file.filename).filter(Boolean);
}

export async function verifyGitHubWebhookSignature(
	rawBody: string,
	signatureHeader: string | null,
) {
	if (!signatureHeader) {
		return {
			valid: false,
			providerId: null as string | null,
		};
	}

	const providers = await listGitHubProviderConfigs();
	for (const provider of providers) {
		const secret = provider.webhookSecret;
		if (!secret) {
			continue;
		}

		const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
		if (signatureHeader.length !== expected.length) {
			continue;
		}

		if (crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))) {
			return {
				valid: true,
				providerId: provider.id,
			};
		}
	}

	return {
		valid: false,
		providerId: null as string | null,
	};
}
