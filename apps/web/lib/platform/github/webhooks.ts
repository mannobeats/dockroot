import {
	db,
	deployments,
	githubInstallations,
	githubWebhookDeliveries,
	stacks,
} from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import {
	getInstallationProviderConfigByInternalInstallationId,
	listChangedFilesForCompare,
} from "@/lib/github-app";
import { queueOrRunDeployment } from "../deployments";
import { materializeGitHubStackSource } from "../github-source";
import { now, parseAutoDeployPathPatterns, shouldTriggerAutoDeployForPaths } from "../shared";

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
