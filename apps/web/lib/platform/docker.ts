import "server-only";

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { db, deployments, stacks } from "@dockroot/db";
import { eq } from "drizzle-orm";
import { ensureDirectory, getPlatformDataDir } from "@/lib/platform/fs";

const execFileAsync = promisify(execFile);

async function runDockerCommand(args: string[]) {
	try {
		return await execFileAsync("docker", args, {
			maxBuffer: 1024 * 1024 * 8,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Docker command failed";
		return {
			stdout: "",
			stderr: message,
		};
	}
}

function parseJsonLines<T>(content: string) {
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as T];
			} catch {
				return [];
			}
		});
}

export async function getLocalDockerSnapshot() {
	const [ps, images, volumes, networks] = await Promise.all([
		runDockerCommand(["ps", "-a", "--format", "{{json .}}"]),
		runDockerCommand(["images", "--format", "{{json .}}"]),
		runDockerCommand(["volume", "ls", "--format", "{{json .}}"]),
		runDockerCommand(["network", "ls", "--format", "{{json .}}"]),
	]);

	const containers = parseJsonLines<Record<string, string>>(ps.stdout);
	const imageRows = parseJsonLines<Record<string, string>>(images.stdout);
	const volumeRows = parseJsonLines<Record<string, string>>(volumes.stdout);
	const networkRows = parseJsonLines<Record<string, string>>(networks.stdout);

	return {
		host: {
			hostname: os.hostname(),
			platform: `${os.platform()} ${os.release()}`,
			architecture: os.arch(),
			cpus: os.cpus().length,
			totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
			freeMemoryGb: Number((os.freemem() / 1024 / 1024 / 1024).toFixed(1)),
		},
		containers: containers.slice(0, 12),
		images: imageRows.slice(0, 12),
		volumes: volumeRows.slice(0, 12),
		networks: networkRows.slice(0, 12),
		counts: {
			containers: containers.length,
			runningContainers: containers.filter((row) => row.State === "running").length,
			images: imageRows.length,
			volumes: volumeRows.length,
			networks: networkRows.length,
		},
	};
}

export async function deployStackLocally({
	deploymentId,
	stackId,
	stackSlug,
	composeYaml,
	operation,
}: {
	deploymentId: string;
	stackId: string;
	stackSlug: string;
	composeYaml: string;
	operation: "deploy" | "destroy";
}) {
	const updatedAt = new Date();
	const stackDir = path.join(getPlatformDataDir(), "stacks", stackSlug);
	await ensureDirectory(stackDir);

	const composePath = path.join(stackDir, "compose.yaml");
	await writeFile(composePath, composeYaml, "utf8");

	const args =
		operation === "destroy"
			? ["compose", "-p", stackSlug, "-f", composePath, "down", "--remove-orphans"]
			: ["compose", "-p", stackSlug, "-f", composePath, "up", "-d", "--remove-orphans"];
	const result = await runDockerCommand(args);
	const succeeded = !result.stderr;

	await db
		.update(deployments)
		.set({
			status: succeeded ? "succeeded" : "failed",
			log: [result.stdout, result.stderr].filter(Boolean).join("\n"),
			summary: succeeded
				? "Deployment completed on the manager host."
				: "Docker Compose reported an error.",
			finishedAt: updatedAt,
			updatedAt,
		})
		.where(eq(deployments.id, deploymentId));

	await db
		.update(stacks)
		.set({
			status: succeeded ? (operation === "destroy" ? "stopped" : "running") : "failed",
			lastDeployedAt: updatedAt,
			updatedAt,
		})
		.where(eq(stacks.id, stackId));
}
