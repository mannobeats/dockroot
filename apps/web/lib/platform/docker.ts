import "server-only";

import { execFile, spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { db, deployments, stacks } from "@dockroot/db";
import { eq } from "drizzle-orm";
import { ensureDirectory, getPlatformDataDir, removeDirectory } from "@/lib/platform/fs";
import { emitRealtime, emitToRoom } from "@/lib/realtime";

const execFileAsync = promisify(execFile);

type DockerCommandResult = {
	stdout: string;
	stderr: string;
	code: number;
	ok: boolean;
};

type ContainerBrowserResult = {
	kind: "directory" | "file" | "missing";
	path: string;
	entries?: Array<{ name: string; kind: "dir" | "file" | "other" }>;
	content?: string;
};

type ComposeProjectSummary = {
	name: string;
	status: string;
	configFiles: string[];
	containers: Array<Record<string, string>>;
	containerCount: number;
	runningCount: number;
};

type ComposeProjectExport = {
	projectName: string;
	composeYaml: string;
	envFileContent: string | null;
	configFiles: string[];
};

const DEFAULT_DOCKER_COMMAND_TIMEOUT_MS = 60_000;

function getDockerCommandTimeoutMs() {
	const configured = Number(process.env.DOCKROOT_DOCKER_COMMAND_TIMEOUT_MS || "");
	if (!Number.isFinite(configured) || configured <= 0) {
		return DEFAULT_DOCKER_COMMAND_TIMEOUT_MS;
	}
	return Math.max(5_000, Math.min(10 * 60_000, Math.floor(configured)));
}

async function runDockerCommand(args: string[]) {
	try {
		const result = await execFileAsync("docker", args, {
			maxBuffer: 1024 * 1024 * 8,
			timeout: getDockerCommandTimeoutMs(),
			killSignal: "SIGTERM",
		});
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			code: 0,
			ok: true,
		} satisfies DockerCommandResult;
	} catch (error) {
		const execError = error as {
			stdout?: string;
			stderr?: string;
			code?: number;
			signal?: string | null;
			message?: string;
		};
		const code = typeof execError?.code === "number" ? execError.code : 1;
		const stderr =
			typeof execError?.stderr === "string" && execError.stderr.trim()
				? execError.stderr
				: execError?.signal
					? `Docker command terminated by signal ${execError.signal}.`
					: execError?.message || "Docker command failed";
		return {
			stdout: typeof execError?.stdout === "string" ? execError.stdout : "",
			stderr,
			code,
			ok: false,
		} satisfies DockerCommandResult;
	}
}

function sanitizeTempFileName(fileName: string) {
	const base = path.basename(String(fileName || "").trim());
	const cleaned = base
		.replaceAll(/[^A-Za-z0-9._-]/g, "_")
		.replace(/^\.+/, "")
		.slice(0, 128);
	return cleaned || "upload.bin";
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

function parseJsonValue<T>(content: string) {
	try {
		return JSON.parse(content) as T;
	} catch {
		return null;
	}
}

function stripAnsi(content: string) {
	const esc = String.fromCharCode(27);
	const bell = String.fromCharCode(7);
	return content
		.replaceAll(new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, "g"), "")
		.replaceAll(new RegExp(`${esc}\\][^${bell}]*${bell}`, "g"), "");
}

export async function getLocalDockerSnapshot() {
	const [ps, images, volumes, networks] = await Promise.all([
		runDockerCommand(["ps", "-a", "--size", "--format", "{{json .}}"]),
		runDockerCommand(["images", "--digests", "--format", "{{json .}}"]),
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
		containers,
		images: imageRows,
		volumes: volumeRows,
		networks: networkRows,
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
	const [inspectResult, logsResult, statsResult] = await Promise.all([
		runDockerCommand(["inspect", containerId]),
		runDockerCommand(["logs", "--tail", "200", containerId]),
		runDockerCommand(["stats", "--no-stream", "--format", "{{json .}}", containerId]),
	]);

	let inspect = null;

	try {
		inspect = JSON.parse(inspectResult.stdout)[0] ?? null;
	} catch {
		inspect = null;
	}

	return {
		inspect,
		logs: stripAnsi([logsResult.stdout, logsResult.stderr].filter(Boolean).join("\n")),
		stats: parseJsonLines<Record<string, string>>(statsResult.stdout)[0] ?? null,
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

export async function listContainers() {
	const result = await runDockerCommand(["ps", "-a", "--size", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function listImages() {
	const result = await runDockerCommand(["images", "--digests", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function listVolumes() {
	const result = await runDockerCommand(["volume", "ls", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function listNetworks() {
	const result = await runDockerCommand(["network", "ls", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function getImageDetails(imageRef: string) {
	const result = await runDockerCommand(["image", "inspect", imageRef]);
	return parseJsonValue<Record<string, unknown>[]>(result.stdout)?.[0] ?? null;
}

export async function getVolumeDetails(volumeName: string) {
	const result = await runDockerCommand(["volume", "inspect", volumeName]);
	return parseJsonValue<Record<string, unknown>[]>(result.stdout)?.[0] ?? null;
}

export async function getNetworkDetails(networkName: string) {
	const result = await runDockerCommand(["network", "inspect", networkName]);
	return parseJsonValue<Record<string, unknown>[]>(result.stdout)?.[0] ?? null;
}

export async function getContainerLogs(
	containerId: string,
	options?: { tail?: number; since?: string },
) {
	const args = ["logs", "--timestamps"];
	if (options?.tail) {
		args.push("--tail", String(options.tail));
	}
	if (options?.since) {
		args.push("--since", options.since);
	}
	args.push(containerId);

	const result = await runDockerCommand(args);
	return stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n"));
}

export async function listComposeProjects(): Promise<ComposeProjectSummary[]> {
	const [composeResult, containers] = await Promise.all([
		runDockerCommand(["compose", "ls", "--all", "--format", "json"]),
		listContainers(),
	]);

	const parsed =
		parseJsonValue<Array<{ Name?: string; Status?: string; ConfigFiles?: string }>>(
			composeResult.stdout,
		) ?? [];

	const byProject = new Map<string, Array<Record<string, string>>>();

	for (const container of containers) {
		const labels = container.Labels || "";
		const composeProject = labels
			.split(",")
			.find((label) => label.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=");

		if (!composeProject) {
			continue;
		}

		const current = byProject.get(composeProject) || [];
		current.push(container);
		byProject.set(composeProject, current);
	}

	return parsed
		.filter((project) => project.Name)
		.map((project) => {
			const projectContainers = byProject.get(project.Name as string) || [];
			return {
				name: project.Name as string,
				status: project.Status || "unknown",
				configFiles: (project.ConfigFiles || "")
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean),
				containers: projectContainers,
				containerCount: projectContainers.length,
				runningCount: projectContainers.filter((container) => container.State === "running").length,
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

export async function controlComposeProject(
	projectName: string,
	configFiles: string[],
	action: "start" | "stop" | "restart" | "destroy",
	options?: {
		removeVolumes?: boolean;
		removeImages?: boolean;
	},
) {
	const composeArgs = configFiles.flatMap((configFile) => ["-f", configFile]);
	const operationArgs =
		action === "destroy"
			? [
					"down",
					"--remove-orphans",
					...(options?.removeVolumes ? ["-v"] : []),
					...(options?.removeImages ? ["--rmi", "local"] : []),
				]
			: action === "start"
				? ["start"]
				: action === "stop"
					? ["stop"]
					: ["restart"];

	const result = await runDockerCommand([
		"compose",
		"-p",
		projectName,
		...composeArgs,
		...operationArgs,
	]);

	emitRealtime("stack:state", {
		projectName,
		action,
		ok: result.ok,
		at: Date.now(),
	});

	return {
		ok: result.ok,
		output: stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n")),
	};
}

async function withTempFile<T>(
	fileName: string,
	content: Buffer | string,
	run: (filePath: string) => Promise<T>,
) {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "dockroot-"));
	const safeFileName = sanitizeTempFileName(fileName);
	const tempFile = path.join(tempDir, safeFileName);

	try {
		await writeFile(tempFile, content);
		return await run(tempFile);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export async function writeContainerFile(containerId: string, targetPath: string, content: string) {
	const fileName = path.basename(targetPath) || "file.txt";
	return withTempFile(fileName, content, async (tempFile) => {
		const parentPath = path.posix.dirname(targetPath);
		await runDockerCommand([
			"exec",
			"-e",
			`TARGET_PARENT=${parentPath}`,
			containerId,
			"sh",
			"-lc",
			'mkdir -p -- "$TARGET_PARENT"',
		]);
		return runDockerCommand(["cp", tempFile, `${containerId}:${targetPath}`]);
	});
}

export async function uploadContainerFile(
	containerId: string,
	targetDirectory: string,
	fileName: string,
	content: Buffer,
) {
	const safeFileName = sanitizeTempFileName(path.posix.basename(String(fileName || "").trim()));
	return withTempFile(safeFileName, content, async (tempFile) => {
		await runDockerCommand([
			"exec",
			"-e",
			`TARGET_DIRECTORY=${targetDirectory}`,
			containerId,
			"sh",
			"-lc",
			'mkdir -p -- "$TARGET_DIRECTORY"',
		]);
		return runDockerCommand([
			"cp",
			tempFile,
			`${containerId}:${targetDirectory.replace(/\/$/, "")}/${safeFileName}`,
		]);
	});
}

export async function deleteContainerPath(containerId: string, targetPath: string) {
	return runDockerCommand([
		"exec",
		"-e",
		`TARGET_PATH=${targetPath}`,
		containerId,
		"sh",
		"-lc",
		'rm -rf -- "$TARGET_PATH"',
	]);
}

export async function exportComposeProjectConfig(
	projectName: string,
	configFiles: string[],
): Promise<ComposeProjectExport> {
	const args = [
		"compose",
		"-p",
		projectName,
		...configFiles.flatMap((configFile) => ["-f", configFile]),
		"config",
	];
	const result = await runDockerCommand(args);

	if (!result.ok || !result.stdout.trim()) {
		throw new Error(result.stderr || "Unable to export compose project config.");
	}

	const envPath = path.join(path.dirname(configFiles[0]), ".env");
	let envFileContent: string | null = null;

	try {
		await access(envPath);
		envFileContent = await readFile(envPath, "utf8");
	} catch {
		envFileContent = null;
	}

	return {
		projectName,
		composeYaml: result.stdout,
		envFileContent,
		configFiles,
	};
}

export async function browseContainerPath(
	containerId: string,
	targetPath: string,
): Promise<ContainerBrowserResult> {
	const result = await runDockerCommand([
		"exec",
		"-e",
		`TARGET_PATH=${targetPath}`,
		containerId,
		"sh",
		"-lc",
		`
if [ -d "$TARGET_PATH" ]; then
  echo "__DIR__"
  for entry in "$TARGET_PATH"/* "$TARGET_PATH"/.[!.]* "$TARGET_PATH"/..?*; do
    [ ! -e "$entry" ] && continue
    name=$(basename "$entry")
    if [ -d "$entry" ]; then
      printf "dir\\t%s\\n" "$name"
    elif [ -f "$entry" ]; then
      printf "file\\t%s\\n" "$name"
    else
      printf "other\\t%s\\n" "$name"
    fi
  done
elif [ -f "$TARGET_PATH" ]; then
  echo "__FILE__"
  sed -n '1,240p' "$TARGET_PATH"
else
  echo "__MISSING__"
fi
		`,
	]);

	const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

	if (output.startsWith("__DIR__")) {
		const entries = output
			.split("\n")
			.slice(1)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [kind, ...rest] = line.split("\t");
				return {
					kind: (kind as "dir" | "file" | "other") || "other",
					name: rest.join("\t"),
				};
			})
			.sort((left, right) => {
				if (left.kind === right.kind) {
					return left.name.localeCompare(right.name);
				}
				return left.kind === "dir" ? -1 : 1;
			});

		return {
			kind: "directory",
			path: targetPath,
			entries,
		};
	}

	if (output.startsWith("__FILE__")) {
		return {
			kind: "file",
			path: targetPath,
			content: output.split("\n").slice(1).join("\n"),
		};
	}

	return {
		kind: "missing",
		path: targetPath,
	};
}

export async function controlContainer(
	containerId: string,
	action: "start" | "stop" | "restart" | "remove",
	options?: {
		removeVolumes?: boolean;
	},
) {
	const args =
		action === "remove"
			? ["rm", "-f", ...(options?.removeVolumes ? ["-v"] : []), containerId]
			: [action, containerId];
	const result = await runDockerCommand(args);
	const ok = result.ok;

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

export async function createVolume(name: string, driver = "local") {
	return runDockerCommand(["volume", "create", "--driver", driver, name]);
}

export async function removeVolume(name: string) {
	return runDockerCommand(["volume", "rm", "-f", name]);
}

export async function pruneVolumes() {
	return runDockerCommand(["volume", "prune", "-f"]);
}

export async function createNetwork(name: string, driver = "bridge") {
	return runDockerCommand(["network", "create", "--driver", driver, name]);
}

export async function removeNetwork(name: string) {
	return runDockerCommand(["network", "rm", name]);
}

export async function pruneNetworks() {
	return runDockerCommand(["network", "prune", "-f"]);
}

export async function pullImage(imageRef: string) {
	return runDockerCommand(["pull", imageRef]);
}

export async function removeImage(imageRef: string) {
	return runDockerCommand(["image", "rm", "-f", imageRef]);
}

export async function pruneImages(options?: { all?: boolean }) {
	return runDockerCommand(["image", "prune", "-f", ...(options?.all ? ["-a"] : [])]);
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
				: [...baseArgs, "up", "-d", "--remove-orphans"];

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
		if (envPath) {
			if (input.envFileContent !== null && input.envFileContent !== undefined) {
				await ensureDirectory(path.dirname(envPath));
				await writeFile(envPath, input.envFileContent || "", "utf8");
			}
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
