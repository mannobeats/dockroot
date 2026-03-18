import { db, githubInstallations, githubProviders, stacks } from "@dockroot/db";
import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	deleteGitHubAppInstallation,
	getGitHubProviderConfigById,
	listGitHubProviderConfigs,
} from "@/lib/github-app";
import { now } from "../shared";

export async function listGitHubProviders(_userId: string) {
	return db.query.githubProviders.findMany({
		where: eq(githubProviders.isActive, true),
		orderBy: [desc(githubProviders.updatedAt)],
		columns: {
			id: true,
			name: true,
			appSlug: true,
			githubAppId: true,
			createdAt: true,
			updatedAt: true,
		},
	});
}

export async function deleteGitHubProvider(_userId: string, providerId: string) {
	const provider = await db.query.githubProviders.findFirst({
		where: eq(githubProviders.id, providerId),
		columns: {
			id: true,
		},
	});
	if (!provider) {
		throw new Error("GitHub provider not found.");
	}

	const providerInstallations = await db.query.githubInstallations.findMany({
		where: eq(githubInstallations.providerId, providerId),
		columns: {
			id: true,
			githubInstallationId: true,
		},
	});
	const installationIds = providerInstallations.map((installation) => installation.id);
	const providerConfig = await getGitHubProviderConfigById(providerId);
	let remoteUninstalled = 0;
	const remoteFailures: string[] = [];

	for (const installation of providerInstallations) {
		if (!providerConfig) {
			break;
		}

		try {
			await deleteGitHubAppInstallation(installation.githubInstallationId, providerConfig);
			remoteUninstalled += 1;
		} catch (error) {
			remoteFailures.push(
				error instanceof Error
					? `${installation.githubInstallationId}: ${error.message}`
					: `${installation.githubInstallationId}: delete failed`,
			);
		}
	}

	if (installationIds.length) {
		await db
			.update(stacks)
			.set({
				githubInstallationId: null,
				autoDeployEnabled: false,
				updatedAt: now(),
			})
			.where(inArray(stacks.githubInstallationId, installationIds));

		await db.delete(githubInstallations).where(eq(githubInstallations.providerId, providerId));
	}

	await db.delete(githubProviders).where(eq(githubProviders.id, providerId));

	revalidatePath("/dashboard/stacks");

	return {
		remoteUninstalled,
		remoteFailures,
	};
}

export async function getGitHubProviderStatus() {
	const providers = await listGitHubProviderConfigs();
	const provider = providers[0] || null;
	return {
		configured: providers.length > 0,
		providerCount: providers.length,
		source: provider?.source || null,
		appSlug: provider?.appSlug || null,
		appId: provider?.appId || null,
	};
}
