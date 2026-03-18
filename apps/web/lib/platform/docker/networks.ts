import "server-only";

import { runDockerCommand } from "@/lib/platform/docker/command";
import { parseJsonLines, parseJsonValue } from "@/lib/platform/docker/parsing";

export async function getNetworkDetails(networkName: string) {
	const result = await runDockerCommand(["network", "inspect", networkName]);
	return parseJsonValue<Record<string, unknown>[]>(result.stdout)?.[0] ?? null;
}

export async function listNetworks() {
	const result = await runDockerCommand(["network", "ls", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function createNetwork(name: string, driver = "bridge") {
	return runDockerCommand(["network", "create", "--driver", driver, name]);
}

export async function removeNetwork(name: string) {
	return runDockerCommand(["network", "rm", name]);
}

export async function pruneNetworks() {
	return runDockerCommand(["network", "prune", "-f"], "prune");
}
