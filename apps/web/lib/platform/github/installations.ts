import { db, githubInstallations, githubProviders, stacks } from "@dockroot/db";
import { and, desc, eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto-secrets";
import {
	getGitHubInstallation,
	getInstallationProviderConfigByInternalInstallationId,
	listGitHubAppInstallations,
	listGitHubProviderConfigs,
	listInstallationRepositories,
} from "@/lib/github-app";
import { now } from "../shared";

export async function listGitHubInstallations(userId: string) {
	const providers = await listGitHubProviderConfigs();
	if (!providers.length) {
		return [];
	}

	for (const provider of providers) {
		const remoteInstallations = await listGitHubAppInstallations(provider).catch(() => []);
		for (const installation of remoteInstallations) {
			await syncGitHubInstallation({
				userId,
				githubInstallationId: String(installation.id),
				providerId: provider.id || undefined,
			});
		}
	}

	const installations = await db.query.githubInstallations.findMany({
		orderBy: [desc(githubInstallations.updatedAt)],
	});

	const hydrated = await Promise.all(
		installations.map(async (installation) => {
			try {
				const repositories = await listInstallationRepositories(
					installation.githubInstallationId,
					(await getInstallationProviderConfigByInternalInstallationId(installation.id)) ||
						undefined,
				);
				return {
					...installation,
					repositories,
				};
			} catch (error) {
				return {
					...installation,
					repositories: [],
					repositoryError:
						error instanceof Error ? error.message : "Unable to load installation repositories.",
				};
			}
		}),
	);

	return hydrated;
}

export async function syncGitHubInstallation({
	userId,
	githubInstallationId,
	providerId,
}: {
	userId: string;
	githubInstallationId: string;
	providerId?: string;
}) {
	const provider =
		providerId != null
			? await db.query.githubProviders.findFirst({
					where: eq(githubProviders.id, providerId),
				})
			: null;
	const installation = await getGitHubInstallation(
		githubInstallationId,
		provider
			? {
					id: provider.id,
					source: "database",
					appId: provider.githubAppId,
					appSlug: provider.appSlug,
					privateKey: decryptSecret(provider.appPrivateKeyEncrypted),
					webhookSecret: decryptSecret(provider.webhookSecretEncrypted),
				}
			: undefined,
	);
	const existing = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.githubInstallationId, githubInstallationId),
	});
	const updatedAt = now();

	if (existing) {
		await db
			.update(githubInstallations)
			.set({
				providerId: providerId || existing.providerId || null,
				accountLogin: installation.account.login,
				accountType: installation.account.type,
				appSlug: installation.app_slug,
				updatedAt,
			})
			.where(eq(githubInstallations.id, existing.id));

		return existing.id;
	}

	const id = crypto.randomUUID();
	await db.insert(githubInstallations).values({
		id,
		providerId: providerId || null,
		githubInstallationId,
		accountLogin: installation.account.login,
		accountType: installation.account.type,
		appSlug: installation.app_slug,
		createdByUserId: userId,
		createdAt: updatedAt,
		updatedAt,
	});

	return id;
}

export async function syncKnownGitHubInstallation(
	githubInstallationId: string,
	providerId?: string,
) {
	const existing = await db.query.githubInstallations.findFirst({
		where: providerId
			? and(
					eq(githubInstallations.githubInstallationId, githubInstallationId),
					eq(githubInstallations.providerId, providerId),
				)
			: eq(githubInstallations.githubInstallationId, githubInstallationId),
	});

	if (!existing) {
		return null;
	}

	return syncGitHubInstallation({
		userId: existing.createdByUserId,
		githubInstallationId,
		providerId: providerId || existing.providerId || undefined,
	});
}

export async function disconnectGitHubInstallation(
	githubInstallationId: string,
	providerId?: string,
) {
	const existing = await db.query.githubInstallations.findFirst({
		where: providerId
			? and(
					eq(githubInstallations.githubInstallationId, githubInstallationId),
					eq(githubInstallations.providerId, providerId),
				)
			: eq(githubInstallations.githubInstallationId, githubInstallationId),
	});

	if (!existing) {
		return;
	}

	const updatedAt = now();
	await db
		.update(stacks)
		.set({
			githubInstallationId: null,
			autoDeployEnabled: false,
			updatedAt,
		})
		.where(eq(stacks.githubInstallationId, existing.id));

	await db.delete(githubInstallations).where(eq(githubInstallations.id, existing.id));
}
