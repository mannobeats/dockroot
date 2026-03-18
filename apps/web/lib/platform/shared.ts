import { createHash } from "node:crypto";
import { emitRealtime } from "@/lib/realtime";

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

export function normalizeAgentUrl(value: string | undefined) {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error("Agent URL must be a valid absolute URL.");
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error("Agent URL must use http or https.");
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.search ||
		parsed.hash ||
		parsed.pathname !== "/"
	) {
		throw new Error("Agent URL must not include credentials, query params, or a path.");
	}

	return parsed.toString().replace(/\/$/, "");
}

export function normalizeManagerUrl(value: string | undefined) {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error("Manager URL must be a valid absolute URL.");
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error("Manager URL must use http or https.");
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.search ||
		parsed.hash ||
		parsed.pathname !== "/"
	) {
		throw new Error("Manager URL must not include credentials, query params, or a path.");
	}

	return parsed.toString().replace(/\/$/, "");
}

function isPrivateIpv4Address(hostname: string) {
	return (
		/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
		/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
		/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
	);
}

function looksLikeContainerHostname(value: string | null | undefined) {
	return /^[a-f0-9]{12,64}$/i.test(String(value || "").trim());
}

export function resolveStoredAgentRuntimeUrl(input: {
	currentUrl?: string | null;
	inferredUrl?: string | null;
	hostname?: string | null;
}) {
	const normalizedCurrent = normalizeAgentUrl(input.currentUrl || undefined);
	const normalizedInferred = normalizeAgentUrl(input.inferredUrl || undefined);

	if (!normalizedCurrent) {
		return normalizedInferred;
	}

	if (!normalizedInferred || normalizedInferred === normalizedCurrent) {
		return normalizedCurrent;
	}

	try {
		const currentHost = new URL(normalizedCurrent).hostname;
		if (isPrivateIpv4Address(currentHost) && looksLikeContainerHostname(input.hostname)) {
			return normalizedInferred;
		}
	} catch {
		return normalizedInferred;
	}

	return normalizedCurrent;
}

export function emitEnvironmentUpdate(environmentId: string, status: string) {
	emitRealtime("environment:update", {
		environmentId,
		status,
		at: Date.now(),
	});
}

export function parseAutoDeployPathPatterns(raw: string | null | undefined) {
	return (raw || "")
		.split(/\r?\n|,/u)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function normalizePathForMatch(path: string) {
	return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function pathMatchesPattern(path: string, pattern: string) {
	const normalizedPath = normalizePathForMatch(path);
	const normalizedPattern = normalizePathForMatch(pattern);
	if (!normalizedPattern) {
		return false;
	}

	if (normalizedPattern.endsWith("/**")) {
		const prefix = normalizedPattern.slice(0, -3);
		return normalizedPath.startsWith(prefix);
	}

	if (normalizedPattern.endsWith("/*")) {
		const prefix = normalizedPattern.slice(0, -2);
		if (!normalizedPath.startsWith(prefix)) {
			return false;
		}
		const remainder = normalizedPath.slice(prefix.length).replace(/^\/+/, "");
		return remainder.length > 0 && !remainder.includes("/");
	}

	return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
}

export function shouldTriggerAutoDeployForPaths(input: {
	patterns: string[];
	changedPaths: string[];
	composePath: string | null;
	envPath: string | null;
}) {
	if (!input.patterns.length) {
		return true;
	}

	const mandatoryPaths = [input.composePath, input.envPath].filter(Boolean) as string[];
	const effectivePaths = [...input.changedPaths, ...mandatoryPaths];
	return effectivePaths.some((changedPath) =>
		input.patterns.some((pattern) => pathMatchesPattern(changedPath, pattern)),
	);
}
