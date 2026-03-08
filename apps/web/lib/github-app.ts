import "server-only";

import crypto from "node:crypto";

const GITHUB_API_BASE = "https://api.github.com";

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

function getAppPrivateKey() {
	return getRequiredEnv("GITHUB_APP_PRIVATE_KEY").replaceAll("\\n", "\n");
}

function getStateSecret() {
	return process.env.GITHUB_APP_STATE_SECRET || getRequiredEnv("BETTER_AUTH_SECRET");
}

async function githubRequest<T>(
	path: string,
	init: RequestInit & {
		token?: string;
		asApp?: boolean;
	} = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/vnd.github+json");
	headers.set("X-GitHub-Api-Version", "2022-11-28");
	headers.set("User-Agent", "dockroot-manager");

	if (init.asApp) {
		headers.set("Authorization", `Bearer ${createGitHubAppJwt()}`);
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

export function isGitHubAppConfigured() {
	return Boolean(
		process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_SLUG,
	);
}

export function getGitHubAppInstallUrl(state: string) {
	return `https://github.com/apps/${getRequiredEnv("GITHUB_APP_SLUG")}/installations/new?state=${encodeURIComponent(state)}`;
}

export function createGitHubAppJwt() {
	const issuedAt = Math.floor(Date.now() / 1000) - 60;
	const expiresAt = issuedAt + 9 * 60;
	const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = encodeBase64Url(
		JSON.stringify({
			iat: issuedAt,
			exp: expiresAt,
			iss: getRequiredEnv("GITHUB_APP_ID"),
		}),
	);
	const signer = crypto.createSign("RSA-SHA256");
	signer.update(`${header}.${payload}`);
	signer.end();
	const signature = signer.sign(getAppPrivateKey());

	return `${header}.${payload}.${encodeBase64Url(signature)}`;
}

export function signGitHubAppState(input: { userId: string; redirectTo: string }) {
	const payload = encodeBase64Url(
		JSON.stringify({
			userId: input.userId,
			redirectTo: input.redirectTo,
			ts: Date.now(),
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
		ts: number;
	};

	if (!decoded.userId || !decoded.redirectTo) {
		throw new Error("Invalid GitHub App state payload");
	}

	return decoded;
}

export async function getGitHubInstallation(installationId: string) {
	return githubRequest<{
		id: number;
		app_slug: string;
		account: {
			login: string;
			type: string;
		};
	}>(`/app/installations/${installationId}`, { asApp: true });
}

export async function listGitHubAppInstallations() {
	const response = await githubRequest<
		Array<{
			id: number;
			app_slug: string;
			account: {
				login: string;
				type: string;
			};
		}>
	>("/app/installations", { asApp: true });

	return response;
}

export async function createInstallationAccessToken(installationId: string) {
	const response = await githubRequest<{
		token: string;
		expires_at: string;
	}>(`/app/installations/${installationId}/access_tokens`, {
		method: "POST",
		asApp: true,
	});

	return response;
}

export async function listInstallationRepositories(installationId: string) {
	const token = await createInstallationAccessToken(installationId);

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
}) {
	const token = await createInstallationAccessToken(input.installationId);
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

export async function getRepositoryBranchHeadSha(input: {
	installationId: string;
	owner: string;
	repository: string;
	branch: string;
}) {
	const token = await createInstallationAccessToken(input.installationId);
	const response = await githubRequest<{
		commit: {
			sha: string;
		};
	}>(`/repos/${input.owner}/${input.repository}/branches/${encodeURIComponent(input.branch)}`, {
		token: token.token,
	});

	return response.commit.sha;
}

export function verifyGitHubWebhookSignature(rawBody: string, signatureHeader: string | null) {
	const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
	if (!secret) {
		throw new Error("Missing required environment variable: GITHUB_APP_WEBHOOK_SECRET");
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
