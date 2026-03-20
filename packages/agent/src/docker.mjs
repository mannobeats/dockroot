import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectDockerEngineSnapshot } from "../../../server/runtime/docker-engine-snapshot.mjs";
import { dataDir } from "./config.mjs";
import {
	detectDockerVersion,
	execFileAsync,
	parseJsonLines,
	parseJsonValue,
	stripAnsi,
	withTempFile,
} from "./utils.mjs";

const DOCKER_OPERATION_TIMEOUTS = {
	default: 30_000,
	"image.pull": 10 * 60_000,
	"container.stats": 15_000,
	prune: 2 * 60_000,
};

function getOperationTimeoutMs(operation) {
	if (process.env.DOCKROOT_DOCKER_COMMAND_TIMEOUT_MS) {
		const override = Number(process.env.DOCKROOT_DOCKER_COMMAND_TIMEOUT_MS);
		if (Number.isFinite(override) && override > 0) {
			return override;
		}
	}
	return DOCKER_OPERATION_TIMEOUTS[operation] || DOCKER_OPERATION_TIMEOUTS.default;
}

export async function runDocker(args, operation) {
	try {
		const result = await execFileAsync("docker", args, {
			maxBuffer: 1024 * 1024 * 16,
			timeout: getOperationTimeoutMs(operation),
		});
		return {
			ok: true,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	} catch (error) {
		return {
			ok: false,
			stdout: "",
			stderr: error instanceof Error ? error.message : "Docker command failed",
		};
	}
}

export async function writeContainerFile(containerId, targetPath, content) {
	const fileName = path.basename(targetPath) || "file.txt";
	return withTempFile(fileName, content, async (tempFile) => {
		const parentPath = path.posix.dirname(targetPath);
		await runDocker([
			"exec",
			"-e",
			`TARGET_PARENT=${parentPath}`,
			containerId,
			"sh",
			"-lc",
			'mkdir -p -- "$TARGET_PARENT"',
		]);
		return runDocker(["cp", tempFile, `${containerId}:${targetPath}`]);
	});
}

export async function uploadContainerFile(containerId, targetDirectory, fileName, content) {
	return withTempFile(fileName, content, async (tempFile) => {
		await runDocker([
			"exec",
			"-e",
			`TARGET_DIRECTORY=${targetDirectory}`,
			containerId,
			"sh",
			"-lc",
			'mkdir -p -- "$TARGET_DIRECTORY"',
		]);
		return runDocker([
			"cp",
			tempFile,
			`${containerId}:${targetDirectory.replace(/\/$/, "")}/${fileName}`,
		]);
	});
}

export async function deleteContainerPath(containerId, targetPath) {
	return runDocker([
		"exec",
		"-e",
		`TARGET_PATH=${targetPath}`,
		containerId,
		"sh",
		"-lc",
		'rm -rf -- "$TARGET_PATH"',
	]);
}

export async function browseContainerPath(containerId, targetPath) {
	const result = await runDocker([
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
					kind: kind || "other",
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

function enrichContainerHealth(row) {
	const status = row.Status || "";
	let healthStatus = null;
	const healthMatch = status.match(/\((healthy|unhealthy|health: starting)\)/i);
	if (healthMatch) {
		const raw = healthMatch[1].toLowerCase();
		healthStatus = raw === "health: starting" ? "starting" : raw;
	}
	return { ...row, HealthStatus: healthStatus };
}

export async function getSnapshot() {
	try {
		return await collectDockerEngineSnapshot();
	} catch {
		const [containers, images, volumes, networks] = await Promise.all([
			runDocker(["ps", "-a", "--size", "--format", "{{json .}}"]),
			runDocker(["images", "--digests", "--format", "{{json .}}"]),
			runDocker(["volume", "ls", "--format", "{{json .}}"]),
			runDocker(["network", "ls", "--format", "{{json .}}"]),
		]);
		const containerRows = parseJsonLines(containers.stdout).map(enrichContainerHealth);
		const imageRows = parseJsonLines(images.stdout);
		const volumeRows = parseJsonLines(volumes.stdout);
		const networkRows = parseJsonLines(networks.stdout);
		const statsRows = parseJsonLines(
			(await runDocker(["stats", "--no-stream", "--format", "{{json .}}"], "container.stats"))
				.stdout,
		);
		const cpuPercent = Number(
			statsRows
				.reduce((sum, row) => {
					return sum + (Number.parseFloat((row.CPUPerc || "0").replace("%", "")) || 0);
				}, 0)
				.toFixed(1),
		);
		const memoryPercent = Number(
			statsRows
				.reduce((sum, row) => {
					return sum + (Number.parseFloat((row.MemPerc || "0").replace("%", "")) || 0);
				}, 0)
				.toFixed(1),
		);

		return {
			host: {
				hostname: os.hostname(),
				platform: `${os.platform()} ${os.release()}`,
				architecture: os.arch(),
				dockerVersion: await detectDockerVersion(),
				cpus: os.cpus().length,
				totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
				freeMemoryGb: Number((os.freemem() / 1024 / 1024 / 1024).toFixed(1)),
			},
			containers: containerRows,
			images: imageRows,
			volumes: volumeRows,
			networks: networkRows,
			counts: {
				containers: containerRows.length,
				runningContainers: containerRows.filter((row) => row.State === "running").length,
				images: imageRows.length,
				volumes: volumeRows.length,
				networks: networkRows.length,
			},
			usage: {
				cpuPercent,
				memoryPercent,
			},
			containerStats: statsRows,
		};
	}
}

export async function getContainerDetails(containerId) {
	const [inspectResult, logsResult, statsResult] = await Promise.all([
		runDocker(["inspect", containerId]),
		runDocker(["logs", "--tail", "200", containerId]),
		runDocker(["stats", "--no-stream", "--format", "{{json .}}", containerId], "container.stats"),
	]);

	const inspect = parseJsonValue(inspectResult.stdout)?.[0] ?? null;
	const rawHealth = inspect?.State?.Health ?? null;
	const health = rawHealth
		? {
				status: rawHealth.Status,
				failingStreak: rawHealth.FailingStreak || 0,
				log: (Array.isArray(rawHealth.Log) ? rawHealth.Log : []).slice(-5).map((entry) => ({
					start: entry.Start || null,
					end: entry.End || null,
					exitCode: entry.ExitCode ?? null,
					output: (entry.Output || "").slice(0, 500),
				})),
			}
		: null;

	return {
		inspect,
		logs: stripAnsi([logsResult.stdout, logsResult.stderr].filter(Boolean).join("\n")),
		stats: parseJsonLines(statsResult.stdout)[0] ?? null,
		health,
	};
}

export async function createVolumeBackup(volumeName, backupId) {
	const safeVolume = volumeName.replace(/[^a-zA-Z0-9._-]/g, "_");
	const safeId = String(backupId).replace(/[^a-zA-Z0-9._-]/g, "_");
	const backupDir = path.join(dataDir, "backups");
	await mkdir(backupDir, { recursive: true });
	const fileName = `${safeId}.tar.gz`;
	const result = await runDocker(
		[
			"run",
			"--rm",
			"-v",
			`${safeVolume}:/volume:ro`,
			"-v",
			`${backupDir}:/backups`,
			"busybox",
			"tar",
			"czf",
			`/backups/${fileName}`,
			"-C",
			"/volume",
			".",
		],
		"prune",
	);
	let sizeBytes = null;
	if (result.ok) {
		try {
			const st = await stat(path.join(backupDir, fileName));
			sizeBytes = st.size;
		} catch {}
	}
	return {
		ok: result.ok,
		fileName,
		sizeBytes,
		output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
	};
}

export async function restoreVolumeBackup(volumeName, backupId) {
	const safeVolume = volumeName.replace(/[^a-zA-Z0-9._-]/g, "_");
	const safeId = String(backupId).replace(/[^a-zA-Z0-9._-]/g, "_");
	const backupDir = path.join(dataDir, "backups");
	const fileName = `${safeId}.tar.gz`;
	const result = await runDocker(
		[
			"run",
			"--rm",
			"-v",
			`${safeVolume}:/volume`,
			"-v",
			`${backupDir}:/backups`,
			"busybox",
			"sh",
			"-c",
			`rm -rf /volume/* && tar xzf /backups/${fileName} -C /volume`,
		],
		"prune",
	);
	return {
		ok: result.ok,
		output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
	};
}

export async function deleteBackup(backupId) {
	const safeId = String(backupId).replace(/[^a-zA-Z0-9._-]/g, "_");
	const backupDir = path.join(dataDir, "backups");
	const filePath = path.join(backupDir, `${safeId}.tar.gz`);
	await import("node:fs/promises").then(({ rm }) => rm(filePath, { force: true }));
}
