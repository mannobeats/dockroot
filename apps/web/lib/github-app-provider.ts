import "server-only";

import crypto from "node:crypto";
import { db, githubInstallations, githubProviders } from "@dockroot/db";
import { and, desc, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto-secrets";

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

function mapDatabaseProviderToConfig(provider: {
	id: string;
	githubAppId: string;
	appSlug: string;
	appPrivateKeyEncrypted: string;
	webhookSecretEncrypted: string;
	appClientId: string | null;
	appClientSecretEncrypted: string | null;
}): GitHubProviderConfig {
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
}

async function loadActiveProvidersFromDatabase(): Promise<GitHubProviderConfig[]> {
	try {
		const providers = await db.query.githubProviders.findMany({
			where: eq(githubProviders.isActive, true),
			orderBy: [desc(githubProviders.updatedAt)],
		});

		return providers.map((provider) => mapDatabaseProviderToConfig(provider));
	} catch {
		return [];
	}
}

export async function getActiveGitHubProviderConfig(): Promise<GitHubProviderConfig | null> {
	const providers = await loadActiveProvidersFromDatabase();
	return providers[0] || null;
}

export async function listGitHubProviderConfigs(): Promise<GitHubProviderConfig[]> {
	return loadActiveProvidersFromDatabase();
}

export async function getGitHubProviderConfigById(
	providerId: string,
): Promise<GitHubProviderConfig | null> {
	try {
		const provider = await db.query.githubProviders.findFirst({
			where: and(eq(githubProviders.id, providerId), eq(githubProviders.isActive, true)),
		});

		if (!provider) {
			return null;
		}

		return mapDatabaseProviderToConfig(provider);
	} catch {
		return null;
	}
}

export async function getRequiredGitHubProviderConfig() {
	const provider = await getActiveGitHubProviderConfig();
	if (!provider) {
		throw new Error("GitHub App provider is not configured.");
	}
	return provider;
}

export async function isGitHubAppConfigured() {
	return (await listGitHubProviderConfigs()).length > 0;
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
	const existing =
		(await db.query.githubProviders.findFirst({
			where: eq(githubProviders.githubAppId, input.appId),
		})) ||
		(await db.query.githubProviders.findFirst({
			where: eq(githubProviders.appSlug, input.slug),
		}));
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

export async function getInstallationProviderConfigByInternalInstallationId(
	internalInstallationId: string,
) {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.id, internalInstallationId),
		with: {
			provider: true,
		},
	});

	if (!installation) {
		return getActiveGitHubProviderConfig();
	}

	if (!installation.provider && installation.appSlug) {
		const matchedProvider = await db.query.githubProviders.findFirst({
			where: and(
				eq(githubProviders.appSlug, installation.appSlug),
				eq(githubProviders.isActive, true),
			),
		});
		if (matchedProvider) {
			return mapDatabaseProviderToConfig(matchedProvider);
		}
	}

	if (!installation.provider) {
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
		where: eq(githubInstallations.githubInstallationId, githubInstallationId),
		with: {
			provider: true,
		},
	});

	if (!installation) {
		return getActiveGitHubProviderConfig();
	}

	if (!installation.provider && installation.appSlug) {
		const matchedProvider = await db.query.githubProviders.findFirst({
			where: and(
				eq(githubProviders.appSlug, installation.appSlug),
				eq(githubProviders.isActive, true),
			),
		});
		if (matchedProvider) {
			return mapDatabaseProviderToConfig(matchedProvider);
		}
	}

	if (!installation.provider) {
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
