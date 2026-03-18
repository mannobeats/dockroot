import "server-only";

import { db, environments } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { ensureDefaultLocalEnvironment } from "@/lib/platform";

export async function getEnvironmentRecord(environmentId: string | undefined, userId: string) {
	if (environmentId) {
		const environment = await db.query.environments.findFirst({
			where: and(eq(environments.id, environmentId), eq(environments.createdByUserId, userId)),
			with: {
				agent: true,
			},
		});

		if (environment) {
			return environment;
		}

		throw new Error("Environment not found.");
	}

	const fallback = await ensureDefaultLocalEnvironment(userId);
	if (!fallback) {
		throw new Error("No runtime environment is available for this user.");
	}

	return fallback;
}

export async function resolveRuntimeEnvironment(userId: string, environmentId?: string) {
	return getEnvironmentRecord(environmentId, userId);
}
