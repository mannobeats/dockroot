import "server-only";

import { execFile, spawn } from "node:child_process";
import { access, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { db, deployments, stacks } from "@dockroot/db";
import { eq } from "drizzle-orm";
import { runDockerCommand } from "@/lib/platform/docker/command";
import { withTempFile } from "@/lib/platform/docker/files";
import { ensureDirectory, getPlatformDataDir, removeDirectory } from "@/lib/platform/fs";
import { emitToRoom } from "@/lib/realtime";

const execFileAsync = promisify(execFile);

type StackWorkspaceInput = {
	stackDir: string;
	repoDir: string;
	sourceType: "manual" | "github";
	composeYaml: string;
	envFileContent?: string | null;
	sourceArchive: Buffer | null;
	composeFilePath?: string;
	envFilePath?: string;
	operation: "deploy" | "destroy";
};

function resolveWorkspaceFilePath(
	rootDir: string,
	relativePath: string | undefined,
	fallback: string,
) {
	const candidate = (relativePath || fallback).trim() || fallback;
	const resolved = path.resolve(rootDir, candidate);
	const relative = path.relative(rootDir, resolved);

	if (
		!relative ||
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error("GitHub stack paths must stay within the repository workspace.");
	}

	return resolved;
}

async function extractRepositoryArchive(archive: Buffer, destinationDir: string) {
	await rm(destinationDir, { recursive: true, force: true });
	await ensureDirectory(destinationDir);

	await withTempFile("source.tar.gz", archive, async (archivePath) => {
		await execFileAsync(
			"tar",
			["-xzf", archivePath, "--strip-components=1", "-C", destinationDir],
			{
				maxBuffer: 1024 * 1024 * 32,
			},
		);
	});
}

async function prepareStackWorkspace(input: StackWorkspaceInput) {
	if (input.sourceType === "github") {
		if (input.operation === "deploy") {
			if (!input.sourceArchive) {
				throw new Error("GitHub deployments require a repository archive.");
			}
			await extractRepositoryArchive(input.sourceArchive, input.repoDir);
		} else {
			const repoExists = await access(input.repoDir)
				.then(() => true)
				.catch(() => false);

			if (!repoExists) {
				throw new Error("GitHub destroy requires an existing repository workspace on disk.");
			}
		}

		const composePath = resolveWorkspaceFilePath(
			input.repoDir,
			input.composeFilePath,
			"compose.yaml",
		);
		const defaultEnvPath = path.join(path.dirname(composePath), ".env");
		const envPath = input.envFilePath
			? resolveWorkspaceFilePath(input.repoDir, input.envFilePath, ".env")
			: input.envFileContent !== null && input.envFileContent !== undefined
				? defaultEnvPath
				: null;
		await ensureDirectory(path.dirname(composePath));
		await writeFile(composePath, input.composeYaml, "utf8");
		if (envPath && input.envFileContent !== null && input.envFileContent !== undefined) {
			await ensureDirectory(path.dirname(envPath));
			await writeFile(envPath, input.envFileContent || "", "utf8");
		}

		return {
			composePath,
			envPath,
			workingDirectory: path.dirname(composePath),
		};
	}

	const composePath = path.join(input.stackDir, "compose.yaml");
	const envPath = path.join(input.stackDir, ".env");
	await writeFile(composePath, input.composeYaml, "utf8");
	await writeFile(envPath, input.envFileContent || "", "utf8");

	return {
		composePath,
		envPath,
		workingDirectory: input.stackDir,
	};
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

		const child = spawn("docker", args, {
			stdio: ["ignore", "pipe", "pipe"],
		});

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
