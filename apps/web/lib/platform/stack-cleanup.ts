import { db, stacks } from "@dockroot/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { AppRole } from "@/lib/authorization";
import { isPrivilegedRole } from "@/lib/authorization";
import { deleteLocalStackResources } from "@/lib/platform/docker";

export async function deleteOwnedStackById(
	stackId: string,
	userId: string,
	options?: { destroyRuntime?: boolean; role?: AppRole },
) {
	const stack = await db.query.stacks.findFirst({
		where: eq(stacks.id, stackId),
		with: {
			environment: {
				with: {
					agent: true,
				},
			},
		},
	});

	if (!stack) {
		throw new Error("Stack not found");
	}

	const canAccessStack =
		stack.createdByUserId === userId ||
		(isPrivilegedRole(options?.role || "member") && stack.environment.createdByUserId === userId);

	if (!canAccessStack) {
		throw new Error("Stack not found");
	}

	if (options?.destroyRuntime !== false && stack.environment.kind === "local") {
		await deleteLocalStackResources(stack.slug);
	} else if (options?.destroyRuntime !== false) {
		const agent = stack.environment.agent?.[0];
		if (!stack.environment.managerUrl || !agent?.accessToken) {
			throw new Error("Remote environment is not registered.");
		}

		const response = await fetch(
			`${stack.environment.managerUrl.replace(/\/$/, "")}/stacks/${encodeURIComponent(stack.slug)}/actions`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${agent.accessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					operation: "destroy",
					sourceType: stack.sourceType,
					composeYaml: stack.composeYaml,
					envFileContent: stack.envFileContent || "",
					composePath: stack.githubPath || "",
					envPath: stack.githubEnvPath || "",
				}),
				cache: "no-store",
			},
		);

		if (!response.ok) {
			const message = await response.text();
			throw new Error(message || "Unable to destroy the remote stack before deleting it.");
		}
	}

	await db.delete(stacks).where(eq(stacks.id, stack.id));

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/stacks");
	revalidatePath(`/dashboard/stacks/${stack.id}`);
	revalidatePath("/dashboard/containers");
	revalidatePath("/dashboard/logs");
}
