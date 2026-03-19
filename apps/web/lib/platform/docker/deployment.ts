import "server-only";

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { db, deployments, stacks } from "@dockroot/db";
import { eq } from "drizzle-orm";
import { runDockerCommand } from "@/lib/platform/docker/command";
import {
	prepareStackWorkspace,
	resolveWorkspaceFilePath,
} from "@/lib/platform/docker/deployment-workspace";
import { ensureDirectory, getPlatformDataDir, removeDirectory } from "@/lib/platform/fs";
import { emitToRoom } from "@/lib/realtime";

const TRANSIENT_COMPOSE_FAILURE_PATTERNS = [
	/TLS handshake timeout/i,
	/net\/http: TLS handshake timeout/i,
	/i\/o timeout/i,
	/connection reset by peer/i,
	/temporary failure in name resolution/i,
	/no such host/i,
	/context deadline exceeded/i,
	/net\/http: request canceled/i,
	/429 Too Many Requests/i,
	/toomanyrequests/i,
];

function isRetryableComposeFailure(output: string) {
	return TRANSIENT_COMPOSE_FAILURE_PATTERNS.some((pattern) => pattern.test(output));
}

function getRetryAttempts(operation: "deploy" | "destroy") {
	if (operation === "destroy") {
		return 1;
	}

	const raw = Number(process.env.DOCKROOT_COMPOSE_RETRY_ATTEMPTS || "3");
	if (!Number.isFinite(raw)) {
		return 3;
	}

	return Math.min(5, Math.max(1, Math.floor(raw)));
}

function getRetryBaseDelayMs() {
	const raw = Number(process.env.DOCKROOT_COMPOSE_RETRY_DELAY_MS || "3000");
	if (!Number.isFinite(raw)) {
		return 3000;
	}

	return Math.min(30_000, Math.max(500, Math.floor(raw)));
}

function sleep(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function deployStackLocally({
	deploymentId,
	stackId,
	stackSlug,
	sourceType,
	composeYaml,
	envFileContent,
	sourceArchive,
	composeFilePath,
	envFilePath,
	operation,
}: {
	deploymentId: string;
	stackId: string;
	stackSlug: string;
	sourceType?: "manual" | "github";
	composeYaml: string;
	envFileContent?: string | null;
	sourceArchive?: Buffer | null;
	composeFilePath?: string;
	envFilePath?: string;
	operation: "deploy" | "destroy";
}) {
	let output = "";
	try {
		const stackDir = path.join(getPlatformDataDir(), "stacks", stackSlug);
		await ensureDirectory(stackDir);
		const repoDir = path.join(stackDir, "repo");
		const { composePath, envPath, workingDirectory } = await prepareStackWorkspace({
			stackDir,
			repoDir,
			sourceType: sourceType || "manual",
			composeYaml,
			envFileContent,
			sourceArchive: sourceArchive || null,
			composeFilePath,
			envFilePath,
			operation,
		});

		const baseArgs = [
			"compose",
			"-p",
			stackSlug,
			"--project-directory",
			workingDirectory,
			...(envPath ? ["--env-file", envPath] : []),
			"-f",
			composePath,
		];

		const args =
			operation === "destroy"
				? [...baseArgs, "down", "--remove-orphans"]
				: [
						...baseArgs,
						"up",
						"-d",
						...(sourceType === "github" ? ["--build"] : []),
						"--remove-orphans",
					];

		const publishChunk = (message: string, stream: "stdout" | "stderr") => {
			output += message;
			emitToRoom(`stack:${stackId}`, "stack:log", {
				stackId,
				deploymentId,
				stream,
				message,
				at: Date.now(),
			});
		};

		const runComposeAttempt = async () => {
			const child = spawn("docker", args, {
				stdio: ["ignore", "pipe", "pipe"],
			});

			let attemptOutput = "";
			const onChunk = (chunk: Buffer | string, stream: "stdout" | "stderr") => {
				const message = chunk.toString();
				attemptOutput += message;
				publishChunk(message, stream);
			};

			child.stdout.on("data", (chunk) => onChunk(chunk, "stdout"));
			child.stderr.on("data", (chunk) => onChunk(chunk, "stderr"));

			const exitCode = await new Promise<number>((resolve, reject) => {
				child.on("error", reject);
				child.on("close", (code) => resolve(code ?? 1));
			});

			return {
				exitCode,
				attemptOutput,
			};
		};

		const maxAttempts = getRetryAttempts(operation);
		const baseDelayMs = getRetryBaseDelayMs();
		let exitCode = 1;
		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			if (maxAttempts > 1) {
				publishChunk(`[manager] docker compose attempt ${attempt}/${maxAttempts}\n`, "stdout");
			}

			const attemptResult = await runComposeAttempt();
			exitCode = attemptResult.exitCode;
			if (exitCode === 0) {
				break;
			}

			const shouldRetry =
				attempt < maxAttempts &&
				operation === "deploy" &&
				isRetryableComposeFailure(attemptResult.attemptOutput);
			if (!shouldRetry) {
				break;
			}

			const delayMs = baseDelayMs * 2 ** (attempt - 1);
			publishChunk(
				`[manager] transient Docker registry/network failure detected; retrying in ${Math.ceil(delayMs / 1000)}s...\n`,
				"stderr",
			);
			await sleep(delayMs);
		}

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
	} catch (error) {
		output += error instanceof Error ? error.message : "Unable to prepare deployment workspace.";
		const updatedAt = new Date();
		await db
			.update(deployments)
			.set({
				status: "failed",
				log: output,
				summary: "Deployment failed before Docker Compose could start.",
				finishedAt: updatedAt,
				updatedAt,
			})
			.where(eq(deployments.id, deploymentId));
		await db
			.update(stacks)
			.set({
				status: "failed",
				updatedAt,
			})
			.where(eq(stacks.id, stackId));
		emitToRoom(`stack:${stackId}`, "deployment:complete", {
			stackId,
			deploymentId,
			status: "failed",
			at: Date.now(),
		});
	}
}

export async function deleteLocalStackResources(stackSlug: string) {
	const stackDir = path.join(getPlatformDataDir(), "stacks", stackSlug);
	const stack = await db.query.stacks.findFirst({
		where: eq(stacks.slug, stackSlug),
		columns: {
			sourceType: true,
			githubPath: true,
			githubEnvPath: true,
		},
	});

	const repoDir = path.join(stackDir, "repo");
	const composePath =
		stack?.sourceType === "github"
			? resolveWorkspaceFilePath(repoDir, stack.githubPath || undefined, "compose.yaml")
			: path.join(stackDir, "compose.yaml");
	const envPathCandidate =
		stack?.sourceType === "github"
			? resolveWorkspaceFilePath(repoDir, stack.githubEnvPath || undefined, ".env")
			: path.join(stackDir, ".env");
	const envPathExists = await access(envPathCandidate)
		.then(() => true)
		.catch(() => false);
	const envPath = envPathExists ? envPathCandidate : null;
	const workingDirectory = stack?.sourceType === "github" ? path.dirname(composePath) : stackDir;
	const composeFileExists = await access(composePath)
		.then(() => true)
		.catch(() => false);

	if (composeFileExists) {
		const result = await runDockerCommand([
			"compose",
			"-p",
			stackSlug,
			"--project-directory",
			workingDirectory,
			...(envPath ? ["--env-file", envPath] : []),
			"-f",
			composePath,
			"down",
			"--volumes",
			"--rmi",
			"local",
			"--remove-orphans",
		]);

		if (!result.ok) {
			throw new Error(result.stderr || `Failed to remove Docker resources for stack ${stackSlug}`);
		}
	}

	await removeDirectory(stackDir);
}
