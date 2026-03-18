import "server-only";

import crypto from "node:crypto";

export function encodeBase64Url(value: Buffer | string) {
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

export function signGitHubAppState(input: {
	userId: string;
	redirectTo: string;
	ttlMs?: number;
	providerId?: string | null;
	providerName?: string | null;
	providerOwner?: string | null;
}) {
	const issuedAt = Date.now();
	const payload = encodeBase64Url(
		JSON.stringify({
			userId: input.userId,
			redirectTo: input.redirectTo,
			providerId: input.providerId || null,
			providerName: input.providerName || null,
			providerOwner: input.providerOwner || null,
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
		providerId?: string | null;
		providerName?: string | null;
		providerOwner?: string | null;
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

export async function signGitHubManifestState(input: {
	userId: string;
	redirectTo: string;
	providerName?: string | null;
	providerOwner?: string | null;
}) {
	return signGitHubAppState({
		userId: input.userId,
		redirectTo: input.redirectTo,
		providerName: input.providerName || null,
		providerOwner: input.providerOwner || null,
		ttlMs: 15 * 60 * 1000,
	});
}
