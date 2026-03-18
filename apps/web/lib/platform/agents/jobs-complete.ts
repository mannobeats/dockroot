import { db, deployments, stacks } from "@dockroot/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { emitRealtime, emitToRoom } from "@/lib/realtime";
import { now } from "../shared";
import { heartbeatAgent } from "./auth";

export async function completeDeployment({
	deploymentId,
	accessToken,
	status,
	log,
}: {
	deploymentId: string;
	accessToken: string;
	status: "succeeded" | "failed";
	log: string;
}) {
	const agent = await heartbeatAgent(accessToken);

	const deployment = await db.query.deployments.findFirst({
		where: and(
			eq(deployments.id, deploymentId),
			eq(deployments.environmentId, agent.environmentId),
		),
		with: {
			stack: true,
		},
	});

	if (!deployment) {
		throw new Error("Deployment not found");
	}

	const updatedAt = now();

	await db
		.update(deployments)
		.set({
			status,
			log,
			summary: status === "succeeded" ? "Deployment completed successfully." : "Deployment failed.",
			finishedAt: updatedAt,
			updatedAt,
		})
		.where(eq(deployments.id, deployment.id));

	if (deployment.stackId) {
		await db
			.update(stacks)
			.set({
				status:
					status === "succeeded"
						? deployment.operation === "destroy"
							? "stopped"
							: "running"
						: "failed",
				lastDeployedAt: updatedAt,
				updatedAt,
			})
			.where(eq(stacks.id, deployment.stackId));
	}

	emitToRoom(`stack:${deployment.stackId}`, "deployment:complete", {
		stackId: deployment.stackId,
		deploymentId,
		status,
		at: Date.now(),
	});
	emitRealtime("deployment:update", {
		stackId: deployment.stackId,
		deploymentId,
		status,
		environmentId: deployment.environmentId,
		at: Date.now(),
	});

	revalidatePath("/dashboard");
	revalidatePath("/dashboard/stacks");
	revalidatePath(`/dashboard/stacks/${deployment.stackId}`);
	revalidatePath("/dashboard/environments");
	revalidatePath(`/dashboard/environments/${deployment.environmentId}`);
}
