import "server-only";

import { runDockerCommand } from "@/lib/platform/docker/command";
import { parseJsonLines, parseJsonValue } from "@/lib/platform/docker/parsing";

export async function getImageDetails(imageRef: string) {
	const result = await runDockerCommand(["image", "inspect", imageRef]);
	return parseJsonValue<Record<string, unknown>[]>(result.stdout)?.[0] ?? null;
}

export async function listImages() {
	const result = await runDockerCommand(["images", "--digests", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function pullImage(imageRef: string) {
	return runDockerCommand(["pull", imageRef], "image.pull");
}

export async function removeImage(imageRef: string) {
	return runDockerCommand(["image", "rm", "-f", imageRef]);
}

export async function pruneImages(options?: { all?: boolean }) {
	return runDockerCommand(["image", "prune", "-f", ...(options?.all ? ["-a"] : [])], "prune");
}
