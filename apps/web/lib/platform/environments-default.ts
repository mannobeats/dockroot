import { agents, db, environments } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { publicEnv } from "@/lib/public-env";
import { hashToken, now, randomToken } from "./shared";

export async function ensureDefaultLocalEnvironment(userId: string) {
	const slug = `local-docker-${userId.slice(0, 8)}`;
	const loadDefaultEnvironment = () =>
		db.query.environments.findFirst({
			where: and(
				eq(environments.createdByUserId, userId),
				eq(environments.kind, "local"),
				eq(environments.isDefaultLocal, true),
			),
			with: {
				agent: true,
			},
		});

	const existing = await loadDefaultEnvironment();
	if (existing?.agent) {
		return existing;
	}

	const createdAt = now();

	if (!existing) {
		await db
			.insert(environments)
			.values({
				id: crypto.randomUUID(),
				name: "Local Docker",
				slug,
				description: "Built-in manager host for instant compose deployments.",
				kind: "local",
				status: "healthy",
				isDefaultLocal: true,
				managerUrl: publicEnv.appUrl,
				createdByUserId: userId,
				createdAt,
				updatedAt: createdAt,
			})
			.onConflictDoNothing({
				target: environments.slug,
			});
	}

	const environment = await loadDefaultEnvironment();
	if (!environment) {
		throw new Error("Failed to provision the default local environment.");
	}

	if (!environment.agent) {
		await db
			.insert(agents)
			.values({
				id: crypto.randomUUID(),
				environmentId: environment.id,
				hostname: "manager-host",
				operatingSystem: process.platform,
				architecture: process.arch,
				dockerVersion: "manager-local",
				status: "healthy",
				registrationToken: hashToken(randomToken(40)),
				accessToken: hashToken(randomToken(48)),
				lastSeenAt: createdAt,
				installedAt: createdAt,
				createdAt,
				updatedAt: createdAt,
			})
			.onConflictDoNothing({
				target: agents.environmentId,
			});
	}

	const hydrated = await loadDefaultEnvironment();
	if (!hydrated) {
		throw new Error("Failed to load the default local environment.");
	}

	return hydrated;
}
