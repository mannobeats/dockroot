import {
	db,
	deployments,
	githubInstallations,
	githubProviders,
	githubWebhookDeliveries,
	stacks,
} from "@dockroot/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { decryptSecret } from "@/lib/crypto-secrets";
import {
	deleteGitHubAppInstallation,
	getGitHubInstallation,
	getGitHubProviderConfigById,
	getInstallationProviderConfigByInternalInstallationId,
	getRepositoryBranchHeadSha,
	listChangedFilesForCompare,
	listGitHubAppInstallations,
	listGitHubProviderConfigs,
	listInstallationRepositories,
} from "@/lib/github-app";
import { queueOrRunDeployment } from "./deployments";
import { materializeGitHubStackSource } from "./github-source";
import { ensureUniqueStackSlug, requireOwnedEnvironment } from "./queries";
import { now, parseAutoDeployPathPatterns, shouldTriggerAutoDeployForPaths } from "./shared";

export async function listGitHubInstallations(_userId: string) {
	const providers = await listGitHubProviderConfigs();
	if (!providers.length) {
		return [];
	}

	for (const provider of providers) {
		const remoteInstallations = await listGitHubAppInstallations(provider).catch(() => []);
		for (const installation of remoteInstallations) {
			await syncGitHubInstallation({
				userId: _userId,
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

export async function createGitHubStack({
	userId,
	environmentId,
	name,
	description,
	installationId,
	repositoryId,
	owner,
	repository,
	branch,
	composePath,
	envPath,
	composeYaml,
	envFileContent,
	autoDeployEnabled = true,
	autoDeployPaths,
}: {
	userId: string;
	environmentId: string;
	name: string;
	description?: string;
	installationId: string;
	repositoryId?: string;
	owner: string;
	repository: string;
	branch: string;
	composePath: string;
	envPath?: string;
	composeYaml?: string;
	envFileContent?: string;
	autoDeployEnabled?: boolean;
	autoDeployPaths?: string | null;
}) {
	await requireOwnedEnvironment(environmentId, userId);

	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.id, installationId),
	});

	if (!installation) {
		throw new Error("GitHub installation not found");
	}
	const provider = await getInstallationProviderConfigByInternalInstallationId(installation.id);

	const source = composeYaml?.trim()
		? {
				composeYaml: composeYaml.trim(),
				envFileContent: envFileContent?.trim() || null,
				sourceCommitSha: await getRepositoryBranchHeadSha({
					installationId: installation.githubInstallationId,
					owner,
					repository,
					branch,
					provider: provider || undefined,
				}),
			}
		: await materializeGitHubStackSource({
				githubInstallationId: installation.githubInstallationId,
				owner,
				repository,
				branch,
				composePath,
				envPath,
				provider: provider || undefined,
			});
	const createdAt = now();
	const slug = await ensureUniqueStackSlug(name);

	await db.insert(stacks).values({
		id: crypto.randomUUID(),
		environmentId,
		name,
		slug,
		description: description?.trim() || null,
		sourceType: "github",
		status: "draft",
		composeYaml: source.composeYaml,
		composeFileName: composePath.split("/").at(-1) || "compose.yaml",
		envFileContent: source.envFileContent,
		envFileName: envPath?.split("/").at(-1) || ".env",
		githubInstallationId: installation.id,
		githubRepositoryId: repositoryId || null,
		githubOwner: owner,
		githubRepository: repository,
		githubBranch: branch,
		githubPath: composePath,
		githubEnvPath: envPath || null,
		autoDeployEnabled,
		autoDeployPaths: autoDeployPaths?.trim() || null,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/stacks");
}

export async function triggerGitHubPushDeploy(input: {
	githubInstallationId: string;
	providerId?: string;
	owner: string;
	repository: string;
	branch: string;
	before?: string | null;
	after?: string | null;
	deliveryId?: string | null;
	changedPaths?: string[];
}) {
	const installation = await db.query.githubInstallations.findFirst({
		where: input.providerId
			? and(
					eq(githubInstallations.githubInstallationId, input.githubInstallationId),
					eq(githubInstallations.providerId, input.providerId),
				)
			: eq(githubInstallations.githubInstallationId, input.githubInstallationId),
	});

	if (!installation) {
		return;
	}
	const provider = await getInstallationProviderConfigByInternalInstallationId(installation.id);
	const nowAt = now();
	let deliveryProcessed = false;

	if (input.deliveryId) {
		const existingDelivery = await db.query.githubWebhookDeliveries.findFirst({
			where: eq(githubWebhookDeliveries.deliveryId, input.deliveryId),
		});
		if (existingDelivery?.processedAt) {
			return;
		}
		if (!existingDelivery) {
			await db.insert(githubWebhookDeliveries).values({
				id: crypto.randomUUID(),
				providerId: installation.providerId || provider?.id || null,
				deliveryId: input.deliveryId,
				event: "push",
				createdAt: nowAt,
				processedAt: null,
			});
		}
	}

	let compareChangedPaths = input.changedPaths || [];
	if (input.before && input.after) {
		try {
			const compareFiles = await listChangedFilesForCompare({
				installationId: input.githubInstallationId,
				owner: input.owner,
				repository: input.repository,
				base: input.before,
				head: input.after,
				provider: provider || undefined,
			});
			compareChangedPaths = Array.from(new Set([...compareChangedPaths, ...compareFiles]));
		} catch {
			compareChangedPaths = Array.from(new Set(compareChangedPaths));
		}
	}

	const matchingStacks = await db.query.stacks.findMany({
		where: and(
			eq(stacks.githubInstallationId, installation.id),
			eq(stacks.githubOwner, input.owner),
			eq(stacks.githubRepository, input.repository),
			eq(stacks.githubBranch, input.branch),
			eq(stacks.autoDeployEnabled, true),
		),
		columns: {
			id: true,
			createdByUserId: true,
			autoDeployPaths: true,
			githubPath: true,
			githubEnvPath: true,
			lastAutoDeployedCommitSha: true,
		},
	});
	const stackFailures: string[] = [];

	for (const stack of matchingStacks) {
		try {
			if (
				input.after &&
				stack.lastAutoDeployedCommitSha &&
				stack.lastAutoDeployedCommitSha === input.after
			) {
				continue;
			}

			const patterns = parseAutoDeployPathPatterns(stack.autoDeployPaths);
			if (
				!shouldTriggerAutoDeployForPaths({
					patterns,
					changedPaths: compareChangedPaths,
					composePath: stack.githubPath,
					envPath: stack.githubEnvPath,
				})
			) {
				continue;
			}

			const perStackDeliveryId = input.deliveryId?.trim()
				? `${input.deliveryId}:${stack.id}`
				: null;
			if (perStackDeliveryId) {
				const existingDeployment = await db.query.deployments.findFirst({
					where: eq(deployments.webhookDeliveryId, perStackDeliveryId),
					columns: { id: true },
				});
				if (existingDeployment) {
					continue;
				}
			}

			const fullStack = await db.query.stacks.findFirst({
				where: eq(stacks.id, stack.id),
				with: {
					githubInstallation: true,
				},
			});

			if (
				fullStack?.githubInstallation &&
				fullStack.githubOwner &&
				fullStack.githubRepository &&
				fullStack.githubBranch &&
				fullStack.githubPath
			) {
				const source = await materializeGitHubStackSource({
					githubInstallationId: fullStack.githubInstallation.githubInstallationId,
					owner: fullStack.githubOwner,
					repository: fullStack.githubRepository,
					branch: fullStack.githubBranch,
					composePath: fullStack.githubPath,
					envPath: fullStack.githubEnvPath || undefined,
					provider: provider || undefined,
				});

				await db
					.update(stacks)
					.set({
						composeYaml: source.composeYaml,
						envFileContent: source.envFileContent,
						lastAutoDeployedCommitSha: source.sourceCommitSha,
						updatedAt: now(),
					})
					.where(eq(stacks.id, fullStack.id));
			}

			await queueOrRunDeployment({
				stackId: stack.id,
				userId: stack.createdByUserId,
				operation: "deploy",
				webhookDeliveryId: perStackDeliveryId,
			});
		} catch (error) {
			stackFailures.push(
				error instanceof Error ? `${stack.id}: ${error.message}` : `${stack.id}: unknown error`,
			);
		}
	}

	if (input.deliveryId && stackFailures.length === 0) {
		await db
			.update(githubWebhookDeliveries)
			.set({ processedAt: now() })
			.where(eq(githubWebhookDeliveries.deliveryId, input.deliveryId));
		deliveryProcessed = true;
	}

	if (input.deliveryId && !deliveryProcessed && stackFailures.length > 0) {
		console.error("[github-webhook] push deploy failed for one or more stacks", {
			deliveryId: input.deliveryId,
			failures: stackFailures,
		});
	}
}
