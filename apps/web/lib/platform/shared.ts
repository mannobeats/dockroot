import { createHash } from "node:crypto";
import { emitRealtime } from "@/lib/realtime";

export {
	parseAutoDeployPathPatterns,
	shouldTriggerAutoDeployForPaths,
} from "@/lib/platform/shared-auto-deploy";
export {
	normalizeAgentUrl,
	normalizeManagerUrl,
	resolveStoredAgentRuntimeUrl,
} from "@/lib/platform/shared-url";

export function now() {
	return new Date();
}

const AGENT_STALE_AFTER_MS = 60_000;

export const AGENT_IMAGE = "ghcr.io/mannobeats/dockroot-agent:latest";
export const AGENT_PORT = 9095;

export function isAgentStale(lastSeenAt: Date | null | undefined) {
	if (!lastSeenAt) {
		return true;
	}

	return Date.now() - lastSeenAt.getTime() > AGENT_STALE_AFTER_MS;
}

export function deriveRuntimeHealthStatus(
	status: "provisioning" | "healthy" | "degraded" | "offline",
	lastSeenAt: Date | null | undefined,
) {
	if (status === "provisioning") {
		return status;
	}

	return isAgentStale(lastSeenAt) ? "offline" : status;
}

export function applyDerivedEnvironmentState<
	T extends {
		status: "provisioning" | "healthy" | "degraded" | "offline";
		kind: "local" | "agent";
		agent?: Array<{
			status: "provisioning" | "healthy" | "degraded" | "offline";
			lastSeenAt: Date | null;
		}>;
	},
>(environment: T): T {
	if (environment.kind !== "agent") {
		return environment;
	}

	const primaryAgent = environment.agent?.[0];
	if (!primaryAgent) {
		return {
			...environment,
			status: "offline",
		};
	}

	const derivedAgentStatus = deriveRuntimeHealthStatus(
		primaryAgent.status,
		primaryAgent.lastSeenAt,
	);
	const derivedEnvironmentStatus = deriveRuntimeHealthStatus(
		environment.status,
		primaryAgent.lastSeenAt,
	);

	return {
		...environment,
		status: derivedEnvironmentStatus,
		agent: environment.agent?.map((agent, index) =>
			index === 0
				? {
						...agent,
						status: derivedAgentStatus,
					}
				: agent,
		),
	};
}

export async function fetchRemoteContainersWithTimeout(
	managerUrl: string,
	accessToken: string,
): Promise<Array<Record<string, string>>> {
	try {
		const response = await fetch(`${managerUrl.replace(/\/$/, "")}/containers`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
			signal: AbortSignal.timeout(2500),
			cache: "no-store",
		});
		if (!response.ok) {
			return [];
		}
		return response.json();
	} catch {
		return [];
	}
}

export function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

export function randomToken(length = 32) {
	return crypto.randomUUID().replaceAll("-", "").slice(0, length);
}

export function hashToken(token: string) {
	return createHash("sha256").update(`${getRequiredTokenPepper()}:${token}`).digest("hex");
}

function getRequiredTokenPepper() {
	return process.env.DOCKROOT_TOKEN_PEPPER || process.env.BETTER_AUTH_SECRET || "";
}

export function emitEnvironmentUpdate(environmentId: string, status: string) {
	emitRealtime("environment:update", {
		environmentId,
		status,
		at: Date.now(),
	});
}
