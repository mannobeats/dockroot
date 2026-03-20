import { agents, db, environments, stacks } from "@dockroot/db";
import { and, eq, ne, or } from "drizzle-orm";
import { publicEnv } from "@/lib/public-env";
import { hashToken, now, randomToken, slugify } from "./shared";

export async function issueRegistrationToken(agentId: string) {
	const token = randomToken(48);

	await db
		.update(agents)
		.set({
			registrationToken: hashToken(token),
			updatedAt: now(),
		})
		.where(eq(agents.id, agentId));

	return token;
}

export async function findAgentByRegistrationToken(registrationToken: string) {
	const hashedToken = hashToken(registrationToken);
	return db.query.agents.findFirst({
		where: or(
			eq(agents.registrationToken, hashedToken),
			eq(agents.registrationToken, registrationToken),
		),
		with: {
			environment: true,
		},
	});
}

export async function findAgentByAccessToken(accessToken: string) {
	const hashedToken = hashToken(accessToken);
	return db.query.agents.findFirst({
		where: or(eq(agents.accessToken, hashedToken), eq(agents.accessToken, accessToken)),
		with: {
			environment: true,
		},
	});
}

export async function requireOwnedEnvironment(environmentId: string, userId: string) {
	const environment = await db.query.environments.findFirst({
		where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
		columns: {
			id: true,
			slug: true,
			isDefaultLocal: true,
			managerUrl: true,
		},
	});

	if (!environment) {
		throw new Error("Environment not found");
	}

	return environment;
}

export async function ensureUniqueEnvironmentSlug(
	baseValue: string,
	options?: { excludeId?: string },
) {
	const baseSlug = slugify(baseValue) || `environment-${randomToken(8)}`;
	let slug = baseSlug;
	let attempt = 1;

	while (true) {
		const existing = await db.query.environments.findFirst({
			where: options?.excludeId
				? and(eq(environments.slug, slug), ne(environments.id, options.excludeId))
				: eq(environments.slug, slug),
			columns: { id: true },
		});

		if (!existing) {
			return slug;
		}

		attempt += 1;
		slug = `${baseSlug}-${attempt}`;
	}
}

export async function ensureUniqueStackSlug(baseValue: string) {
	const baseSlug = slugify(baseValue) || `stack-${randomToken(8)}`;
	let slug = baseSlug;
	let attempt = 1;

	while (true) {
		const existing = await db.query.stacks.findFirst({
			where: eq(stacks.slug, slug),
			columns: { id: true },
		});

		if (!existing) {
			return slug;
		}

		attempt += 1;
		slug = `${baseSlug}-${attempt}`;
	}
}

export async function getStoredManagerUrl(userId: string) {
	const defaultLocal = await db.query.environments.findFirst({
		where: and(eq(environments.createdByUserId, userId), eq(environments.isDefaultLocal, true)),
		columns: {
			managerUrl: true,
		},
	});

	return defaultLocal?.managerUrl || publicEnv.appUrl;
}
