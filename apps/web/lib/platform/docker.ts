import "server-only";

import { execFile, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { db, deployments, stacks } from "@dockroot/db";
import { eq } from "drizzle-orm";
import { ensureDirectory, getPlatformDataDir } from "@/lib/platform/fs";
import { emitRealtime, emitToRoom } from "@/lib/realtime";

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

export async function getContainerDetails(containerId: string) {
	const [inspectResult, logsResult] = await Promise.all([
		runDockerCommand(["inspect", containerId]),
		runDockerCommand(["logs", "--tail", "200", containerId]),
	]);

	let inspect = null;

	try {
		inspect = JSON.parse(inspectResult.stdout)[0] ?? null;
	} catch {
		inspect = null;
	}

	return {
		inspect,
		logs: [logsResult.stdout, logsResult.stderr].filter(Boolean).join("\n"),
	};
}

export async function listStackContainers(stackSlug: string) {
	const result = await runDockerCommand([
		"ps",
		"-a",
		"--filter",
		`label=com.docker.compose.project=${stackSlug}`,
		"--format",
		"{{json .}}",
	]);

	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function controlContainer(containerId: string, action: "start" | "stop" | "restart") {
	const result = await runDockerCommand([action, containerId]);
	const ok = !result.stderr;

	emitRealtime("container:state", {
		containerId,
		action,
		ok,
		at: Date.now(),
	});

	return {
		ok,
		output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
	};
}

export async function deployStackLocally({
	deploymentId,
	stackId,
	stackSlug,
	composeYaml,
	envFileContent,
	operation,
}: {
	deploymentId: string;
	stackId: string;
	stackSlug: string;
	composeYaml: string;
	envFileContent?: string | null;
	operation: "deploy" | "destroy";
}) {
	const stackDir = path.join(getPlatformDataDir(), "stacks", stackSlug);
	await ensureDirectory(stackDir);

	const composePath = path.join(stackDir, "compose.yaml");
	await writeFile(composePath, composeYaml, "utf8");
	const envPath = path.join(stackDir, ".env");
	await writeFile(envPath, envFileContent || "", "utf8");

	const args =
		operation === "destroy"
			? [
					"compose",
					"-p",
					stackSlug,
					"--env-file",
					envPath,
					"-f",
					composePath,
					"down",
					"--remove-orphans",
				]
			: [
					"compose",
					"-p",
					stackSlug,
					"--env-file",
					envPath,
					"-f",
					composePath,
					"up",
					"-d",
					"--remove-orphans",
				];

	const child = spawn("docker", args, {
		stdio: ["ignore", "pipe", "pipe"],
	});

	let output = "";

	const publishChunk = (chunk: Buffer | string, stream: "stdout" | "stderr") => {
		const message = chunk.toString();
		output += message;
		emitToRoom(`stack:${stackId}`, "stack:log", {
			stackId,
			deploymentId,
			stream,
			message,
			at: Date.now(),
		});
	};

	child.stdout.on("data", (chunk) => publishChunk(chunk, "stdout"));
	child.stderr.on("data", (chunk) => publishChunk(chunk, "stderr"));

	const exitCode = await new Promise<number>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 1));
	});

	const updatedAt = new Date();
	const succeeded = exitCode === 0;

	await db
		.update(deployments)
		.set({
			status: succeeded ? "succeeded" : "failed",
			log: output,
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

	emitToRoom(`stack:${stackId}`, "deployment:complete", {
		stackId,
		deploymentId,
		status: succeeded ? "succeeded" : "failed",
		at: Date.now(),
	});
}
