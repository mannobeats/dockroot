import { db, environments } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getPlatformDataDir } from "@/lib/platform/fs";
import { publicEnv } from "@/lib/public-env";
import { listStacks } from "./dashboard";
import { ensureDefaultLocalEnvironment, listEnvironments } from "./environments";
import { normalizeManagerUrl, now } from "./shared";

export async function getGlobalSettings(userId: string) {
	await ensureDefaultLocalEnvironment(userId);

	const environmentsList = await listEnvironments(userId);
	const stacksList = await listStacks(userId);
	const defaultLocal = environmentsList.find((environment) => environment.isDefaultLocal);

	return {
		managerUrl: defaultLocal?.managerUrl || publicEnv.appUrl,
		dataDir: getPlatformDataDir(),
		environments: environmentsList.length,
		stacks: stacksList.filter((stack) => stack.type === "tracked").length,
	};
}

export async function updateGlobalSettings({
	userId,
	managerUrl,
}: {
	userId: string;
	managerUrl: string;
}) {
	await ensureDefaultLocalEnvironment(userId);

	const normalizedManagerUrl =
		normalizeManagerUrl(managerUrl) || publicEnv.appUrl.replace(/\/$/, "");
	const defaultLocal = await db.query.environments.findFirst({
		where: and(eq(environments.createdByUserId, userId), eq(environments.isDefaultLocal, true)),
		columns: {
			id: true,
		},
	});

	if (!defaultLocal) {
		throw new Error("Default local environment not found.");
	}

	await db
		.update(environments)
		.set({
			managerUrl: normalizedManagerUrl,
			updatedAt: now(),
		})
		.where(eq(environments.id, defaultLocal.id));

	revalidatePath("/dashboard/settings");
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/stacks");
	revalidatePath("/dashboard/environments");
	revalidatePath("/dashboard");
}
