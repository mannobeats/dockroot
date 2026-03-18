import "server-only";

import type { getEnvironmentRecord } from "@/lib/environment-runtime/environment";
import { RuntimeConnectionError } from "@/lib/environment-runtime/types";

export type RuntimeEnvironment = Awaited<ReturnType<typeof getEnvironmentRecord>>;

export async function fetchAgent(
	environment: RuntimeEnvironment,
	path: string,
	init?: RequestInit,
) {
	if (!environment || environment.kind !== "agent") {
		throw new RuntimeConnectionError(
			"remote_unavailable",
			"Remote agent environment is not available.",
		);
	}

	const agent = environment.agent?.[0];
	if (!environment.managerUrl || !agent?.accessToken) {
		throw new RuntimeConnectionError("agent_not_registered", "Agent is not registered yet.");
	}

	let response: Response;
	try {
		response = await fetch(`${environment.managerUrl.replace(/\/$/, "")}${path}`, {
			...init,
			signal: init?.signal ?? AbortSignal.timeout(2500),
			headers: {
				Authorization: `Bearer ${agent.accessToken}`,
				...(init?.headers || {}),
			},
			cache: "no-store",
		});
	} catch {
		throw new RuntimeConnectionError(
			"remote_unavailable",
			"Remote agent is unreachable right now.",
		);
	}

	if (!response.ok) {
		throw new RuntimeConnectionError(
			response.status === 401 || response.status === 403
				? "agent_unauthorized"
				: "agent_request_failed",
			response.status === 401 || response.status === 403
				? "Agent request was not authorized."
				: `Agent request failed for ${path}.`,
		);
	}

	return response;
}

export async function fetchAgentJson<T = unknown>(
	environment: RuntimeEnvironment,
	path: string,
	init?: RequestInit,
) {
	return (await fetchAgent(environment, path, init)).json() as Promise<T>;
}

export async function fetchAgentText(
	environment: RuntimeEnvironment,
	path: string,
	init?: RequestInit,
) {
	return (await fetchAgent(environment, path, init)).text();
}
