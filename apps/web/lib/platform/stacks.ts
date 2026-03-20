import { db, deployments, stacks } from "@dockroot/db";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { AppRole } from "@/lib/authorization";
import { isPrivilegedRole } from "@/lib/authorization";
import { exportComposeProjectConfig } from "@/lib/platform/docker";
import { isProtectedManagerStack } from "@/lib/runtime-protection";
import { ensureDefaultLocalEnvironment } from "./environments";
import { ensureUniqueStackSlug, requireOwnedEnvironment } from "./queries";
import { now } from "./shared";
import { deleteOwnedStackById } from "./stack-cleanup";

async function findAccessibleStackById({
	stackId,
	userId,
	role,
	withDeployments = false,
}: {
	stackId: string;
	userId: string;
	role?: AppRole;
	withDeployments?: boolean;
}) {
	const stack = await db.query.stacks.findFirst({
		where: eq(stacks.id, stackId),
		with: {
			environment: true,
			...(withDeployments
				? {
						deployments: {
							orderBy: [desc(deployments.createdAt)],
							limit: 20,
						},
					}
				: {}),
		},
	});

	if (!stack) {
		return null;
	}

	if (stack.createdByUserId === userId) {
		return stack;
	}

	if (isPrivilegedRole(role || "member") && stack.environment.createdByUserId === userId) {
		return stack;
	}

	return null;
}

export async function getStackById({
	stackId,
	userId,
	role,
}: {
	stackId: string;
	userId: string;
	role?: AppRole;
}) {
	return findAccessibleStackById({
		stackId,
		userId,
		role,
		withDeployments: true,
	});
}

export async function createStack({
	userId,
	environmentId,
	name,
	description,
	composeYaml,
	envFileContent,
}: {
	userId: string;
	environmentId: string;
	name: string;
	description?: string;
	composeYaml: string;
	envFileContent?: string;
}) {
	await requireOwnedEnvironment(environmentId, userId);

	const createdAt = now();
	const slug = await ensureUniqueStackSlug(name);

	await db.insert(stacks).values({
		id: crypto.randomUUID(),
		environmentId,
		name,
		slug,
		description: description?.trim() || null,
		sourceType: "manual",
		status: "draft",
		composeYaml,
		envFileContent: envFileContent?.trim() || null,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/stacks");
}

export async function updateStackConfig({
	stackId,
	userId,
	role,
	composeYaml,
	envFileContent,
}: {
	stackId: string;
	userId: string;
	role?: AppRole;
	composeYaml: string;
	envFileContent?: string;
}) {
	const stack = await findAccessibleStackById({
		stackId,
		userId,
		role,
	});

	if (!stack) {
		throw new Error("Stack not found");
	}

	await db
		.update(stacks)
		.set({
			composeYaml,
			envFileContent: envFileContent?.trim() || null,
			updatedAt: now(),
		})
		.where(eq(stacks.id, stack.id));

	revalidatePath("/dashboard/stacks");
	revalidatePath(`/dashboard/stacks/${stack.id}`);
}

export async function adoptComposeProject({
	userId,
	projectName,
	configFiles,
}: {
	userId: string;
	projectName: string;
	configFiles: string[];
}) {
	if (!projectName || !configFiles.length) {
		throw new Error("Compose project name and config files are required.");
	}

	if (isProtectedManagerStack(projectName)) {
		throw new Error("Dockroot platform stacks are protected and cannot be adopted.");
	}

	const existingStack = await db.query.stacks.findFirst({
		where: and(eq(stacks.createdByUserId, userId), eq(stacks.slug, projectName)),
	});

	if (existingStack) {
		return existingStack.id;
	}

	const environment = await ensureDefaultLocalEnvironment(userId);
	if (!environment) {
		throw new Error("Default local environment could not be prepared.");
	}
	const exported = await exportComposeProjectConfig(projectName, configFiles);
	const createdAt = now();
	const humanName = projectName
		.split("-")
		.map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
		.join(" ");

	const stackId = crypto.randomUUID();
	await db.insert(stacks).values({
		id: stackId,
		environmentId: environment.id,
		name: humanName,
		slug: projectName,
		description: `Imported from ${configFiles.join(", ")}`,
		sourceType: "manual",
		status: "stopped",
		composeYaml: exported.composeYaml,
		composeFileName: configFiles[0].split("/").at(-1) || "compose.yaml",
		envFileContent: exported.envFileContent,
		envFileName: ".env",
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	});

	revalidatePath("/dashboard/stacks");
	return stackId;
}

export async function deleteStack({
	stackId,
	userId,
	role,
}: {
	stackId: string;
	userId: string;
	role?: AppRole;
}) {
	await deleteOwnedStackById(stackId, userId, { destroyRuntime: false, role });
}
