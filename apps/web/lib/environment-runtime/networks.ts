import "server-only";

import {
	createNetwork,
	getNetworkDetails,
	listNetworks,
	pruneNetworks,
	removeNetwork,
} from "@/lib/platform/docker";
import { getEnvironmentRecord } from "@/lib/environment-runtime/environment";
import { fetchAgent, fetchAgentJson } from "@/lib/environment-runtime/remote-agent";

export async function listNetworksForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			networks: await listNetworks(),
		};
	}

	return {
		environment,
		networks: await fetchAgentJson(environment, "/networks"),
	};
}

export async function getNetworkDetailsForEnvironment(
	userId: string,
	networkName: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return {
			environment,
			network: await getNetworkDetails(networkName),
		};
	}

	return {
		environment,
		network: await fetchAgentJson(environment, `/networks/${encodeURIComponent(networkName)}`),
	};
}

export async function createNetworkForEnvironment(
	userId: string,
	name: string,
	driver: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return createNetwork(name, driver);
	}

	await fetchAgent(environment, "/networks/create", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ name, driver }),
	});
}

export async function removeNetworkForEnvironment(
	userId: string,
	name: string,
	environmentId?: string,
) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return removeNetwork(name);
	}

	await fetchAgent(environment, "/networks/remove", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({ name }),
	});
}

export async function pruneNetworksForEnvironment(userId: string, environmentId?: string) {
	const environment = await getEnvironmentRecord(environmentId, userId);
	if (environment.kind === "local") {
		return pruneNetworks();
	}

	await fetchAgent(environment, "/networks/prune", {
		method: "POST",
	});
}
