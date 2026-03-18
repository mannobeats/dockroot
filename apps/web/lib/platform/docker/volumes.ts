import "server-only";

import { runDockerCommand } from "@/lib/platform/docker/command";
import { parseJsonLines, parseJsonValue } from "@/lib/platform/docker/parsing";

export async function getVolumeDetails(volumeName: string) {
	const result = await runDockerCommand(["volume", "inspect", volumeName]);
	return parseJsonValue<Record<string, unknown>[]>(result.stdout)?.[0] ?? null;
}

export async function listVolumes() {
	const result = await runDockerCommand(["volume", "ls", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function createVolume(name: string, driver = "local") {
	return runDockerCommand(["volume", "create", "--driver", driver, name]);
}

export async function removeVolume(name: string) {
	return runDockerCommand(["volume", "rm", "-f", name]);
}

export async function pruneVolumes() {
	return runDockerCommand(["volume", "prune", "-f"], "prune");
}
