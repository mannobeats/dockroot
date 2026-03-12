import "server-only";

import crypto from "node:crypto";
import { db, githubInstallations, githubProviders } from "@dockroot/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto-secrets";

const GITHUB_API_BASE = "https://api.github.com";

export type GitHubProviderConfig = {
	id: string;
	source: "database";
	appId: string;
	appSlug: string;
	privateKey: string;
	webhookSecret: string | null;
	clientId?: string | null;
	clientSecret?: string | null;
};

function encodeBase64Url(value: Buffer | string) {
	return Buffer.from(value)
		.toString("base64")
		.replaceAll("=", "")
		.replaceAll("+", "-")
		.replaceAll("/", "_");
}

function getRequiredEnv(name: string) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function getStateSecret() {
	return process.env.GITHUB_APP_STATE_SECRET || getRequiredEnv("BETTER_AUTH_SECRET");
}

async function loadProviderFromDatabase(): Promise<GitHubProviderConfig | null> {
	try {
		const provider = await db.query.githubProviders.findFirst({
			where: eq(githubProviders.isActive, true),
			orderBy: [desc(githubProviders.updatedAt)],
		});

		if (!provider) {
			return null;
		}

		return {
			id: provider.id,
			source: "database",
			appId: provider.githubAppId,
			appSlug: provider.appSlug,
			privateKey: decryptSecret(provider.appPrivateKeyEncrypted),
			webhookSecret: decryptSecret(provider.webhookSecretEncrypted),
			clientId: provider.appClientId,
			clientSecret: provider.appClientSecretEncrypted
				? decryptSecret(provider.appClientSecretEncrypted)
				: null,
		};
	} catch {
		return null;
	}
}

export async function getActiveGitHubProviderConfig(): Promise<GitHubProviderConfig | null> {
	return loadProviderFromDatabase();
}

async function getRequiredGitHubProviderConfig() {
	const provider = await getActiveGitHubProviderConfig();
	if (!provider) {
		throw new Error("GitHub App provider is not configured.");
	}
	return provider;
}

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

export async function isGitHubAppConfigured() {
	return Boolean(await getActiveGitHubProviderConfig());
}

export async function getGitHubAppInstallUrl(state: string) {
	const provider = await getRequiredGitHubProviderConfig();
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

export function signGitHubAppState(input: { userId: string; redirectTo: string; ttlMs?: number }) {
	const issuedAt = Date.now();
	const payload = encodeBase64Url(
		JSON.stringify({
			userId: input.userId,
			redirectTo: input.redirectTo,
			iat: issuedAt,
			expiresAt: issuedAt + (input.ttlMs ?? 10 * 60 * 1000),
		}),
	);
	const signature = encodeBase64Url(
		crypto.createHmac("sha256", getStateSecret()).update(payload).digest(),
	);

	return `${payload}.${signature}`;
}

export function verifyGitHubAppState(state: string) {
	const [payload, signature] = state.split(".");
	if (!payload || !signature) {
		throw new Error("Invalid GitHub App state");
	}

	const expected = encodeBase64Url(
		crypto.createHmac("sha256", getStateSecret()).update(payload).digest(),
	);
	if (signature.length !== expected.length) {
		throw new Error("Invalid GitHub App state signature");
	}

	if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
		throw new Error("Invalid GitHub App state signature");
	}

	const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
		userId: string;
		redirectTo: string;
		iat?: number;
		expiresAt?: number;
	};

	if (!decoded.userId || !decoded.redirectTo) {
		throw new Error("Invalid GitHub App state payload");
	}

	if (decoded.expiresAt && Date.now() > decoded.expiresAt) {
		throw new Error("GitHub App state expired");
	}

	return decoded;
}

export async function signGitHubManifestState(input: { userId: string; redirectTo: string }) {
	return signGitHubAppState({
		userId: input.userId,
		redirectTo: input.redirectTo,
		ttlMs: 15 * 60 * 1000,
	});
}

export function getGitHubManifestCreateUrl(manifest: Record<string, unknown>, state?: string) {
	const base = `https://github.com/settings/apps/new?manifest=${encodeURIComponent(JSON.stringify(manifest))}`;
	if (!state) {
		return base;
	}
	return `${base}&state=${encodeURIComponent(state)}`;
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
		throw new Error(
			`GitHub app manifest conversion failed (${response.status} ${response.statusText}).`,
		);
	}

	return (await response.json()) as {
		id: number;
		slug: string;
		client_id?: string;
		client_secret?: string;
		pem: string;
		webhook_secret: string;
	};
}

export async function upsertGitHubProviderFromManifest(input: {
	userId: string;
	name: string;
	appId: string;
	slug: string;
	privateKey: string;
	webhookSecret: string;
	clientId?: string | null;
	clientSecret?: string | null;
}) {
	await db
		.update(githubProviders)
		.set({ isActive: false })
		.where(eq(githubProviders.isActive, true));

	const existing = await db.query.githubProviders.findFirst({
		where: eq(githubProviders.githubAppId, input.appId),
	});
	const updatedAt = new Date();

	if (existing) {
		await db
			.update(githubProviders)
			.set({
				name: input.name,
				appSlug: input.slug,
				appClientId: input.clientId || null,
				appClientSecretEncrypted: input.clientSecret ? encryptSecret(input.clientSecret) : null,
				appPrivateKeyEncrypted: encryptSecret(input.privateKey),
				webhookSecretEncrypted: encryptSecret(input.webhookSecret),
				isActive: true,
				updatedAt,
			})
			.where(eq(githubProviders.id, existing.id));

		return existing.id;
	}

	const id = crypto.randomUUID();
	await db.insert(githubProviders).values({
		id,
		name: input.name,
		githubAppId: input.appId,
		appSlug: input.slug,
		appClientId: input.clientId || null,
		appClientSecretEncrypted: input.clientSecret ? encryptSecret(input.clientSecret) : null,
		appPrivateKeyEncrypted: encryptSecret(input.privateKey),
		webhookSecretEncrypted: encryptSecret(input.webhookSecret),
		webhookPath: "/api/github/webhook",
		isActive: true,
		createdByUserId: input.userId,
		createdAt: updatedAt,
		updatedAt,
	});

	return id;
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
	const provider = await getRequiredGitHubProviderConfig();
	const secret = provider.webhookSecret;

	if (!secret) {
		throw new Error("Missing GitHub webhook secret.");
	}

	if (!signatureHeader) {
		return false;
	}

	const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
	if (signatureHeader.length !== expected.length) {
		return false;
	}

	return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}

export async function getInstallationProviderConfigByInternalInstallationId(
	internalInstallationId: string,
) {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.id, internalInstallationId),
		with: {
			provider: true,
		},
	});

	if (!installation?.provider) {
		return getActiveGitHubProviderConfig();
	}

	return {
		id: installation.provider.id,
		source: "database" as const,
		appId: installation.provider.githubAppId,
		appSlug: installation.provider.appSlug,
		privateKey: decryptSecret(installation.provider.appPrivateKeyEncrypted),
		webhookSecret: decryptSecret(installation.provider.webhookSecretEncrypted),
		clientId: installation.provider.appClientId,
		clientSecret: installation.provider.appClientSecretEncrypted
			? decryptSecret(installation.provider.appClientSecretEncrypted)
			: null,
	};
}

export async function getInstallationProviderConfigByGitHubInstallationId(
	githubInstallationId: string,
) {
	const installation = await db.query.githubInstallations.findFirst({
		where: and(
			eq(githubInstallations.githubInstallationId, githubInstallationId),
			isNotNull(githubInstallations.providerId),
		),
		with: {
			provider: true,
		},
	});

	if (!installation?.provider) {
		return getActiveGitHubProviderConfig();
	}

	return {
		id: installation.provider.id,
		source: "database" as const,
		appId: installation.provider.githubAppId,
		appSlug: installation.provider.appSlug,
		privateKey: decryptSecret(installation.provider.appPrivateKeyEncrypted),
		webhookSecret: decryptSecret(installation.provider.webhookSecretEncrypted),
		clientId: installation.provider.appClientId,
		clientSecret: installation.provider.appClientSecretEncrypted
			? decryptSecret(installation.provider.appClientSecretEncrypted)
			: null,
	};
}
