import { agents, db, environments } from "@dockroot/db";
import { eq } from "drizzle-orm";
import { resolveManagerUrl } from "@/lib/manager-url";
import { publicEnv } from "@/lib/public-env";
import { emitRealtime } from "@/lib/realtime";
import { persistRuntimeSnapshotMetrics } from "@/lib/runtime-metrics";
import { deriveRegisteredManagerUrl } from "../environments";
import { findAgentByAccessToken, findAgentByRegistrationToken } from "../queries";
import {
	emitEnvironmentUpdate,
	hashToken,
	now,
	randomToken,
	resolveStoredAgentRuntimeUrl,
} from "../shared";

export async function registerAgent({
	registrationToken,
	hostname,
	operatingSystem,
	architecture,
	dockerVersion,
	agentUrl,
	managerUrl,
}: {
	registrationToken: string;
	hostname?: string;
	operatingSystem?: string;
	architecture?: string;
	dockerVersion?: string;
	agentUrl?: string;
	managerUrl?: string;
}) {
	const agent = await findAgentByRegistrationToken(registrationToken);

	if (!agent) {
		throw new Error("Invalid registration token");
	}

	const updatedAt = now();
	const accessToken = randomToken(64);

	await db
		.update(agents)
		.set({
			hostname: hostname || agent.hostname,
			operatingSystem: operatingSystem || agent.operatingSystem,
			architecture: architecture || agent.architecture,
			dockerVersion: dockerVersion || agent.dockerVersion,
			status: "healthy",
			accessToken,
			registrationToken: hashToken(randomToken(48)),
			lastSeenAt: updatedAt,
			installedAt: agent.installedAt ?? updatedAt,
			updatedAt,
		})
		.where(eq(agents.id, agent.id));

	await db
		.update(environments)
		.set({
			status: "healthy",
			managerUrl: deriveRegisteredManagerUrl({
				currentUrl: agent.environment.managerUrl,
				inferredUrl: agentUrl,
				hostname: hostname || agent.hostname,
			}),
			updatedAt,
		})
		.where(eq(environments.id, agent.environmentId));

	emitEnvironmentUpdate(agent.environmentId, "healthy");

	return {
		agentId: agent.id,
		environmentId: agent.environmentId,
		accessToken,
		managerUrl:
			resolveManagerUrl({
				configuredUrl: managerUrl || null,
			}) || publicEnv.appUrl,
	};
}

export async function heartbeatAgent(
	accessToken: string,
	snapshot?: Parameters<typeof persistRuntimeSnapshotMetrics>[0]["snapshot"],
	agentUrl?: string,
) {
	const agent = await findAgentByAccessToken(accessToken);

	if (!agent) {
		throw new Error("Invalid agent token");
	}

	const updatedAt = now();

	await db
		.update(agents)
		.set({
			accessToken,
			status: "healthy",
			lastSeenAt: updatedAt,
			updatedAt,
		})
		.where(eq(agents.id, agent.id));

	await db
		.update(environments)
		.set({
			status: "healthy",
			managerUrl: resolveStoredAgentRuntimeUrl({
				currentUrl: agent.environment.managerUrl,
				inferredUrl: agentUrl,
				hostname: agent.hostname,
			}),
			updatedAt,
		})
		.where(eq(environments.id, agent.environmentId));

	emitEnvironmentUpdate(agent.environmentId, "healthy");

	if (snapshot) {
		await persistRuntimeSnapshotMetrics({
			environmentId: agent.environmentId,
			snapshot,
			source: "agent",
		});

		emitRealtime("runtime:metrics", {
			environmentId: agent.environmentId,
			at: Date.now(),
			containers: snapshot.containerStats || [],
			host: {
				source: "native",
				cpuPercent: snapshot.usage?.cpuPercent ?? null,
				memoryPercent: snapshot.usage?.memoryPercent ?? null,
			},
		});
	}

	return agent;
}
