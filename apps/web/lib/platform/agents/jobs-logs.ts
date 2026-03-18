import { db, deployments } from "@dockroot/db";
import { and, eq, sql } from "drizzle-orm";
import { emitToRoom } from "@/lib/realtime";
import { now } from "../shared";
import { heartbeatAgent } from "./auth";

export async function appendDeploymentLogEvents({
	deploymentId,
	accessToken,
	events,
}: {
	deploymentId: string;
	accessToken: string;
	events: Array<{
		stream?: "stdout" | "stderr";
		message?: string;
		at?: number;
	}>;
}) {
	if (!events.length) {
		return;
	}

	const agent = await heartbeatAgent(accessToken);
	const deployment = await db.query.deployments.findFirst({
		where: and(
			eq(deployments.id, deploymentId),
			eq(deployments.environmentId, agent.environmentId),
		),
		with: {
			stack: {
				columns: {
					id: true,
				},
			},
		},
	});

	if (!deployment) {
		throw new Error("Deployment not found");
	}

	const combinedLog = events
		.map((event) => String(event.message || ""))
		.filter(Boolean)
		.join("");
	if (!combinedLog) {
		return;
	}

	const updatedAt = now();
	await db
		.update(deployments)
		.set({
			log: sql`coalesce(${deployments.log}, '') || ${combinedLog}`,
			updatedAt,
		})
		.where(eq(deployments.id, deployment.id));

	for (const event of events) {
		emitToRoom(`stack:${deployment.stackId}`, "stack:log", {
			stackId: deployment.stackId,
			deploymentId,
			stream: event.stream === "stderr" ? "stderr" : "stdout",
			message: String(event.message || ""),
			at: Number(event.at || Date.now()),
		});
	}
}
