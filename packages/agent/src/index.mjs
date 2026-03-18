import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import * as pty from "node-pty";

const execFileAsync = promisify(execFile);

const managerUrl = (process.env.DOCKROOT_MANAGER_URL || process.env.MANAGER_URL || "").replace(
	/\/$/,
	"",
);
const registrationToken =
	process.env.DOCKROOT_AGENT_REGISTRATION_TOKEN || process.env.REGISTRATION_TOKEN || "";
const dataDir = process.env.DOCKROOT_AGENT_DATA_DIR || "/var/lib/dockroot-agent";
const listenPort = Number(process.env.DOCKROOT_AGENT_PORT || 9095);
const pollIntervalMs = Math.max(2000, Number(process.env.DOCKROOT_AGENT_POLL_INTERVAL_MS || 10000));
const statePath = path.join(dataDir, "state.json");
const stacksDir = path.join(dataDir, "stacks");
const terminalSessions = new Map();
const supportedShells = new Set(["sh", "bash", "ash", "zsh"]);
const defaultShellOrder = ["sh", "bash", "ash", "zsh"];

const metrics = {
	registered: 0,
	connected: 0,
	lastHeartbeatTimestampSeconds: 0,
	lastJobFinishedTimestampSeconds: 0,
	lastPollTimestampSeconds: 0,
	jobsSucceeded: 0,
	jobsFailed: 0,
};

// ── Streaming docker stats for agent ─────────────────────────────
let agentDockerStatsProcess = null;
let agentLatestContainerStats = [];
let agentShuttingDown = false;

function startAgentDockerStatsStream() {
	if (agentDockerStatsProcess) return;

	const proc = spawn("docker", ["stats", "--format", "{{json .}}", "--no-trunc"], {
		stdio: ["ignore", "pipe", "ignore"],
	});
	agentDockerStatsProcess = proc;

	let buffer = "";

	proc.stdout.on("data", (chunk) => {
		buffer += chunk.toString();
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";

		const rows = [];
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				rows.push(JSON.parse(trimmed));
			} catch {
				// skip
			}
		}

		if (rows.length > 0) {
			agentLatestContainerStats = rows;
		}
	});

	proc.on("exit", () => {
		agentDockerStatsProcess = null;
		if (!agentShuttingDown) {
			setTimeout(() => startAgentDockerStatsStream(), 3000);
		}
	});

	proc.on("error", () => {
		agentDockerStatsProcess = null;
		if (!agentShuttingDown) {
			setTimeout(() => startAgentDockerStatsStream(), 5000);
		}
	});
}

function stopAgentDockerStatsStream() {
	agentShuttingDown = true;
	if (agentDockerStatsProcess) {
		agentDockerStatsProcess.kill("SIGTERM");
		agentDockerStatsProcess = null;
	}
}

function getAdvertisedAgentUrl() {
	const explicitUrl = (process.env.DOCKROOT_AGENT_URL || "").trim();
	if (explicitUrl) {
		return explicitUrl.replace(/\/$/, "");
	}

	return null;
}

function clampTerminalColumns(value) {
	const parsed = Number(value || 120);
	return Number.isFinite(parsed) ? Math.max(40, Math.min(300, Math.floor(parsed))) : 120;
}

function clampTerminalRows(value) {
	const parsed = Number(value || 36);
	return Number.isFinite(parsed) ? Math.max(12, Math.min(120, Math.floor(parsed))) : 36;
}

function isSafeCustomShell(value) {
	return typeof value === "string" && /^[A-Za-z0-9_./-]{1,120}$/.test(value);
}

function escapeSingleQuotes(value) {
	return value.replaceAll("'", "'\"'\"'");
}

function resolveShellCandidates(payload) {
	const requestedShell =
		typeof payload?.shell === "string" ? payload.shell.trim().toLowerCase() : defaultShellOrder[0];
	const customShell = typeof payload?.customShell === "string" ? payload.customShell.trim() : "";
	if (requestedShell === "custom" && !isSafeCustomShell(customShell)) {
		throw new Error("Invalid custom shell.");
	}

	const candidates = [];
	if (requestedShell === "custom" && customShell) {
		candidates.push(customShell);
	}
	if (supportedShells.has(requestedShell)) {
		candidates.push(requestedShell);
	}
	for (const candidate of defaultShellOrder) {
		candidates.push(candidate);
	}

	return Array.from(new Set(candidates));
}

function buildShellProbeScript(candidates) {
	const tokens = candidates.map((candidate) => `'${escapeSingleQuotes(candidate)}'`).join(" ");
	return `for shell_bin in ${tokens}; do if command -v "$shell_bin" >/dev/null 2>&1; then printf "%s" "$shell_bin"; exit 0; fi; done; exit 127`;
}

async function resolveContainerShell(containerId, candidates) {
	try {
		const probe = await execFileAsync(
			"docker",
			["exec", containerId, "sh", "-lc", buildShellProbeScript(candidates)],
			{
				maxBuffer: 1024 * 64,
			},
		);
		const resolved = probe.stdout.trim();
		if (resolved) {
			return resolved;
		}
	} catch {
		// Fall back to requested ordering when probe fails.
	}

	return candidates[0] || "sh";
}

function parseJsonLines(content) {
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line)];
			} catch {
				return [];
			}
		});
}

function parseJsonValue(content) {
	try {
		return JSON.parse(content);
	} catch {
		return null;
	}
}

function stripAnsi(content) {
	const esc = String.fromCharCode(27);
	const bell = String.fromCharCode(7);
	return content
		.replaceAll(new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, "g"), "")
		.replaceAll(new RegExp(`${esc}\\][^${bell}]*${bell}`, "g"), "");
}

async function ensureDirectories() {
	await mkdir(stacksDir, { recursive: true });
}

async function loadState() {
	try {
		const raw = await readFile(statePath, "utf8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

async function saveState(state) {
	await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

function parseEnvPayload(content) {
	return Object.fromEntries(
		content
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const index = line.indexOf("=");
				if (index < 0) {
					return [line, ""];
				}
				return [line.slice(0, index), line.slice(index + 1)];
			}),
	);
}

async function requestText(url, options = {}) {
	const response = await fetch(url, options);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(text || `Request failed for ${url}`);
	}
	return text;
}

async function requestBuffer(url, options = {}) {
	const response = await fetch(url, options);
	const buffer = Buffer.from(await response.arrayBuffer());
	if (!response.ok) {
		throw new Error(buffer.toString("utf8") || `Request failed for ${url}`);
	}
	return buffer;
}

async function detectDockerVersion() {
	try {
		const { stdout } = await execFileAsync("docker", [
			"version",
			"--format",
			"{{.Server.Version}}",
		]);
		return stdout.trim() || "unknown";
	} catch {
		return "unknown";
	}
}

// ---------------------------------------------------------------------------
// Per-operation Docker command timeouts (matching the web app's docker.ts)
// ---------------------------------------------------------------------------
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

async function runDocker(args, operation) {
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

async function withTempFile(fileName, content, run) {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "dockroot-agent-"));
	const tempFile = path.join(tempDir, fileName);

	try {
		await writeFile(tempFile, content);
		return await run(tempFile);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

async function writeContainerFile(containerId, targetPath, content) {
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

async function uploadContainerFile(containerId, targetDirectory, fileName, content) {
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

async function deleteContainerPath(containerId, targetPath) {
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

async function browseContainerPath(containerId, targetPath) {
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

async function ensureRegistered(state) {
	if (!managerUrl) {
		throw new Error("Missing DOCKROOT_MANAGER_URL");
	}

	if (state.agentToken) {
		metrics.registered = 1;
		return state;
	}

	if (!registrationToken) {
		throw new Error("Missing DOCKROOT_AGENT_REGISTRATION_TOKEN");
	}

	const dockerVersion = await detectDockerVersion();
	const payload = {
		registrationToken,
		hostname: os.hostname(),
		operatingSystem: `${os.platform()} ${os.release()}`,
		architecture: os.arch(),
		dockerVersion,
		agentUrl: getAdvertisedAgentUrl(),
	};

	const response = await requestText(`${managerUrl}/api/agent/register`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	const parsed = parseEnvPayload(response);
	const nextState = {
		...state,
		agentId: parsed.AGENT_ID || state.agentId || "",
		environmentId: parsed.ENVIRONMENT_ID || state.environmentId || "",
		agentToken: parsed.AGENT_TOKEN || "",
		managerUrl: (parsed.MANAGER_URL || managerUrl).replace(/\/$/, ""),
		registeredAt: new Date().toISOString(),
		lastDockerVersion: dockerVersion,
	};

	await saveState(nextState);
	metrics.registered = 1;
	return nextState;
}

async function heartbeat(state, snapshot) {
	await requestText(`${state.managerUrl || managerUrl}/api/agent/heartbeat`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			Authorization: `Bearer ${state.agentToken}`,
		},
		body: JSON.stringify({
			agentUrl: getAdvertisedAgentUrl(),
			snapshot,
		}),
	});

	metrics.connected = 1;
	metrics.lastHeartbeatTimestampSeconds = Math.floor(Date.now() / 1000);
}

async function pollJob(state) {
	const response = await requestText(`${state.managerUrl || managerUrl}/api/agent/jobs/next`, {
		headers: {
			Authorization: `Bearer ${state.agentToken}`,
		},
	});

	metrics.lastPollTimestampSeconds = Math.floor(Date.now() / 1000);
	return parseEnvPayload(response);
}

function resolveWorkspaceFilePath(rootDir, relativePath, fallback) {
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

async function extractArchive(archive, destinationDir) {
	await rm(destinationDir, { recursive: true, force: true });
	await mkdir(destinationDir, { recursive: true });

	return withTempFile("source.tar.gz", archive, async (archivePath) => {
		await execFileAsync(
			"tar",
			["-xzf", archivePath, "--strip-components=1", "-C", destinationDir],
			{
				maxBuffer: 1024 * 1024 * 32,
			},
		);
	});
}

async function prepareComposeWorkspace(state, job) {
	const stackDir = path.join(stacksDir, job.STACK_SLUG);
	const repoDir = path.join(stackDir, "repo");
	await mkdir(stackDir, { recursive: true });

	if (job.SOURCE_TYPE === "github") {
		if (job.OPERATION === "deploy") {
			const archive = await requestBuffer(
				`${state.managerUrl || managerUrl}/api/agent/jobs/${encodeURIComponent(job.JOB_ID)}/source`,
				{
					headers: {
						Authorization: `Bearer ${state.agentToken}`,
					},
				},
			);
			await extractArchive(archive, repoDir);
		} else {
			const repoExists = await access(repoDir)
				.then(() => true)
				.catch(() => false);

			if (!repoExists) {
				const fallbackComposePath = path.join(stackDir, "compose.yaml");
				const fallbackEnvPath = path.join(stackDir, ".env");
				await writeFile(
					fallbackComposePath,
					Buffer.from(job.COMPOSE_B64 || "", "base64").toString("utf8"),
					"utf8",
				);
				await writeFile(
					fallbackEnvPath,
					Buffer.from(job.ENV_B64 || "", "base64").toString("utf8"),
					"utf8",
				);

				return {
					composePath: fallbackComposePath,
					envPath: fallbackEnvPath,
					workingDirectory: stackDir,
				};
			}
		}

		const composePath = resolveWorkspaceFilePath(repoDir, job.COMPOSE_PATH, "compose.yaml");
		const envPath = resolveWorkspaceFilePath(repoDir, job.ENV_PATH, ".env");
		await mkdir(path.dirname(composePath), { recursive: true });
		await mkdir(path.dirname(envPath), { recursive: true });
		await writeFile(
			composePath,
			Buffer.from(job.COMPOSE_B64 || "", "base64").toString("utf8"),
			"utf8",
		);
		await writeFile(envPath, Buffer.from(job.ENV_B64 || "", "base64").toString("utf8"), "utf8");

		return {
			composePath,
			envPath,
			workingDirectory: path.dirname(composePath),
		};
	}

	const composePath = path.join(stackDir, "compose.yaml");
	const envPath = path.join(stackDir, ".env");
	await writeFile(
		composePath,
		Buffer.from(job.COMPOSE_B64 || "", "base64").toString("utf8"),
		"utf8",
	);
	await writeFile(envPath, Buffer.from(job.ENV_B64 || "", "base64").toString("utf8"), "utf8");

	return {
		composePath,
		envPath,
		workingDirectory: stackDir,
	};
}

async function runComposeJob(state, job) {
	try {
		const { composePath, envPath, workingDirectory } = await prepareComposeWorkspace(state, job);

		const args =
			job.OPERATION === "destroy"
				? [
						"compose",
						"-p",
						job.STACK_SLUG,
						"--project-directory",
						workingDirectory,
						"--env-file",
						envPath,
						"-f",
						composePath,
						"down",
						"--volumes",
						"--rmi",
						"local",
						"--remove-orphans",
					]
				: [
						"compose",
						"-p",
						job.STACK_SLUG,
						"--project-directory",
						workingDirectory,
						"--env-file",
						envPath,
						"-f",
						composePath,
						"up",
						"-d",
						"--build",
						"--remove-orphans",
					];

		let output = "";
		const child = spawn("docker", args, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		const publishChunk = (chunk, stream) => {
			const message = chunk.toString();
			output += message;
			job.onChunk?.({
				stream,
				message,
				at: Date.now(),
			});
		};

		child.stdout.on("data", (chunk) => publishChunk(chunk, "stdout"));
		child.stderr.on("data", (chunk) => publishChunk(chunk, "stderr"));

		const exitCode = await new Promise((resolve, reject) => {
			child.on("error", reject);
			child.on("close", (code) => resolve(code ?? 1));
		});

		return {
			status: exitCode === 0 ? "succeeded" : "failed",
			log: output.trim() || `docker compose exited with code ${exitCode}`,
		};
	} catch (error) {
		return {
			status: "failed",
			log: error instanceof Error ? error.message : "Docker command failed",
		};
	}
}

function createJobEventReporter(state, jobId) {
	const queue = [];
	let flushTimer = null;
	let inflight = Promise.resolve();

	const flushBatch = () => {
		const batch = queue.splice(0);
		if (!batch.length) {
			return;
		}

		inflight = inflight
			.then(() =>
				requestText(`${state.managerUrl || managerUrl}/api/agent/jobs/${jobId}/events`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${state.agentToken}`,
						"content-type": "application/json",
					},
					body: JSON.stringify(batch),
				}),
			)
			.catch((error) => {
				console.error("[jobs] Failed to push log events:", error.message);
			});
	};

	return {
		push(event) {
			queue.push(event);
			if (flushTimer) {
				return;
			}

			flushTimer = setTimeout(() => {
				flushTimer = null;
				flushBatch();
			}, 150);
			flushTimer.unref?.();
		},
		async flush() {
			if (flushTimer) {
				clearTimeout(flushTimer);
				flushTimer = null;
			}
			flushBatch();
			await inflight;
		},
	};
}

async function reportJobResult(state, jobId, status, log) {
	await requestText(
		`${state.managerUrl || managerUrl}/api/agent/jobs/${jobId}/complete?status=${encodeURIComponent(status)}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${state.agentToken}`,
				"content-type": "text/plain; charset=utf-8",
			},
			body: log,
		},
	);

	metrics.lastJobFinishedTimestampSeconds = Math.floor(Date.now() / 1000);
	if (status === "succeeded") {
		metrics.jobsSucceeded += 1;
	} else {
		metrics.jobsFailed += 1;
	}
}

async function readHealthSnapshot() {
	const state = await loadState();
	return {
		ok: true,
		managerUrl: state.managerUrl || managerUrl || null,
		environmentId: state.environmentId || null,
		agentId: state.agentId || null,
		registered: Boolean(state.agentToken),
		connected: Boolean(metrics.connected),
		hostname: os.hostname(),
		port: listenPort,
	};
}

async function requireAgentAuth(request) {
	const state = await loadState();
	const header = request.headers.authorization || "";
	const bearerToken = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
	const hashedStateToken = state.agentToken
		? createHash("sha256").update(state.agentToken).digest("hex")
		: "";

	if (!state.agentToken || (bearerToken !== state.agentToken && bearerToken !== hashedStateToken)) {
		return null;
	}

	return state;
}

function sendJson(response, status, payload) {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	response.end(JSON.stringify(payload));
}

async function readRequestJson(request) {
	const chunks = [];
	for await (const chunk of request) {
		chunks.push(chunk);
	}

	if (!chunks.length) {
		return {};
	}

	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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

async function getSnapshot() {
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
	// Use cached streaming stats instead of spawning docker stats --no-stream
	const statsRows = agentLatestContainerStats.length > 0
		? agentLatestContainerStats
		: parseJsonLines((await runDocker(["stats", "--no-stream", "--format", "{{json .}}"], "container.stats")).stdout);
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

async function getContainerDetails(containerId) {
	const [inspectResult, logsResult, statsResult] = await Promise.all([
		runDocker(["inspect", containerId]),
		runDocker(["logs", "--tail", "200", containerId]),
		runDocker(["stats", "--no-stream", "--format", "{{json .}}", containerId], "container.stats"),
	]);

	const inspect = parseJsonValue(inspectResult.stdout)?.[0] ?? null;

	// Extract structured health data (matching docker.ts getContainerDetails)
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

function closeTerminalSession(sessionId) {
	const session = terminalSessions.get(sessionId);
	if (!session) {
		return;
	}

	session.process.kill();
	session.closed = true;
	setTimeout(() => {
		terminalSessions.delete(sessionId);
	}, 60_000).unref?.();
}

async function createTerminalSession(payload) {
	const sessionId = globalThis.crypto.randomUUID();
	if (payload?.target !== "container" || !payload?.containerId) {
		throw new Error("containerId is required.");
	}
	const shellCandidates = resolveShellCandidates(payload);
	const shell = await resolveContainerShell(payload.containerId, shellCandidates);
	const cols = clampTerminalColumns(payload?.cols);
	const rows = clampTerminalRows(payload?.rows);
	const command = {
		file: "docker",
		args: ["exec", "-it", payload.containerId, shell, "-i"],
		cwd: "/",
	};
	const child = pty.spawn(command.file, command.args, {
		name: "xterm-color",
		cols,
		rows,
		cwd: command.cwd,
		env: {
			...process.env,
			TERM: process.env.TERM || "xterm-256color",
			COLORTERM: process.env.COLORTERM || "truecolor",
		},
	});

	const session = {
		process: child,
		resize: (nextCols, nextRows) =>
			child.resize(clampTerminalColumns(nextCols), clampTerminalRows(nextRows)),
		events: [],
		nextCursor: 1,
		closed: false,
		exitCode: null,
	};

	const onData = (chunk) => {
		session.events.push({
			cursor: session.nextCursor,
			data: String(chunk || ""),
		});
		session.nextCursor += 1;
		if (session.events.length > 512) {
			session.events.shift();
		}
	};
	child.onData(onData);
	child.onExit(({ exitCode }) => {
		session.closed = true;
		session.exitCode = exitCode ?? 0;
	});

	terminalSessions.set(sessionId, session);

	return sessionId;
}

function startHttpServer() {
	const server = createServer(async (request, response) => {
		if (!request.url) {
			response.writeHead(404).end();
			return;
		}

		const url = new URL(request.url, `http://127.0.0.1:${listenPort}`);
		const pathName = url.pathname;

		if (pathName === "/healthz") {
			const body = JSON.stringify(await readHealthSnapshot());
			response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
			response.end(body);
			return;
		}

		const authedState = pathName === "/healthz" ? null : await requireAgentAuth(request);
		if (!authedState) {
			response.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
			response.end("Unauthorized");
			return;
		}

		if (request.method === "GET" && pathName === "/snapshot") {
			sendJson(response, 200, await getSnapshot());
			return;
		}

		if (request.method === "GET" && pathName === "/containers") {
			sendJson(response, 200, (await getSnapshot()).containers);
			return;
		}

		const stackActionsMatch = pathName.match(/^\/stacks\/([^/]+)\/actions$/);
		if (request.method === "POST" && stackActionsMatch) {
			const stackSlug = decodeURIComponent(stackActionsMatch[1]);
			const input = await readRequestJson(request);
			const result = await runComposeJob(authedState, {
				JOB_ID: `adhoc-${Date.now()}`,
				STACK_SLUG: stackSlug,
				SOURCE_TYPE: input.sourceType === "github" ? "github" : "manual",
				OPERATION: input.operation === "destroy" ? "destroy" : "deploy",
				COMPOSE_B64: Buffer.from(String(input.composeYaml || ""), "utf8").toString("base64"),
				ENV_B64: Buffer.from(String(input.envFileContent || ""), "utf8").toString("base64"),
				COMPOSE_PATH: String(input.composePath || ""),
				ENV_PATH: String(input.envPath || ""),
			});
			sendJson(response, result.status === "succeeded" ? 200 : 400, {
				ok: result.status === "succeeded",
				status: result.status,
				log: result.log,
			});
			return;
		}

		const containerMatch = pathName.match(/^\/containers\/([^/]+)$/);
		if (request.method === "GET" && containerMatch) {
			sendJson(response, 200, await getContainerDetails(decodeURIComponent(containerMatch[1])));
			return;
		}

		const containerLogsMatch = pathName.match(/^\/containers\/([^/]+)\/logs$/);
		if (request.method === "GET" && containerLogsMatch) {
			const tail = url.searchParams.get("tail") || "150";
			const result = await runDocker([
				"logs",
				"--timestamps",
				"--tail",
				tail,
				decodeURIComponent(containerLogsMatch[1]),
			]);
			response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
			response.end(stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n")));
			return;
		}

		const containerFilesMatch = pathName.match(/^\/containers\/([^/]+)\/files$/);
		if (containerFilesMatch) {
			const containerId = decodeURIComponent(containerFilesMatch[1]);

			if (request.method === "GET") {
				const targetPath = url.searchParams.get("path") || "/";
				sendJson(response, 200, await browseContainerPath(containerId, targetPath));
				return;
			}

			if (request.method === "PUT") {
				const { path: targetPath, content } = await readRequestJson(request);
				const result = await writeContainerFile(
					containerId,
					String(targetPath || "/"),
					String(content || ""),
				);
				sendJson(response, result.ok ? 200 : 400, result);
				return;
			}

			if (request.method === "POST") {
				const { path: targetPath, fileName, contentBase64 } = await readRequestJson(request);
				const result = await uploadContainerFile(
					containerId,
					String(targetPath || "/"),
					String(fileName || "upload.bin"),
					Buffer.from(String(contentBase64 || ""), "base64"),
				);
				sendJson(response, result.ok ? 200 : 400, result);
				return;
			}

			if (request.method === "DELETE") {
				const { path: targetPath } = await readRequestJson(request);
				const result = await deleteContainerPath(containerId, String(targetPath || "/"));
				sendJson(response, result.ok ? 200 : 400, result);
				return;
			}
		}

		const containerActionsMatch = pathName.match(/^\/containers\/([^/]+)\/actions$/);
		if (request.method === "POST" && containerActionsMatch) {
			const { action, removeVolumes } = await readRequestJson(request);
			const containerId = decodeURIComponent(containerActionsMatch[1]);
			registerAgentAction(containerId, action === "remove" ? "destroy" : action);
			if (action === "stop" || action === "remove") {
				registerAgentAction(containerId, "die");
			}
			const args =
				action === "remove"
					? ["rm", "-f", ...(removeVolumes ? ["-v"] : []), containerId]
					: [String(action), containerId];
			const result = await runDocker(args);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		// POST /containers — standalone container creation
		if (request.method === "POST" && pathName === "/containers") {
			const input = await readRequestJson(request);
			const name = String(input.name || "").trim();
			const image = String(input.image || "").trim();
			if (!name || !image) {
				sendJson(response, 400, { ok: false, output: "Name and image are required." });
				return;
			}
			if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
				sendJson(response, 400, { ok: false, output: "Invalid container name." });
				return;
			}

			const dockerArgs = ["run", "-d", "--name", name];

			if (input.memory?.trim()) {
				if (!/^\d+[bkmg]$/i.test(input.memory.trim())) {
					sendJson(response, 400, { ok: false, output: "Invalid memory format." });
					return;
				}
				dockerArgs.push("--memory", input.memory.trim());
			}
			if (input.cpus?.trim()) {
				const cpuVal = Number(input.cpus);
				if (!Number.isFinite(cpuVal) || cpuVal <= 0) {
					sendJson(response, 400, { ok: false, output: "CPUs must be a positive number." });
					return;
				}
				dockerArgs.push("--cpus", String(cpuVal));
			}
			if (input.restartPolicy?.trim()) {
				const policy = input.restartPolicy.trim();
				if (!["no", "always", "unless-stopped", "on-failure"].includes(policy)) {
					sendJson(response, 400, { ok: false, output: "Invalid restart policy." });
					return;
				}
				dockerArgs.push("--restart", policy);
			}
			if (Array.isArray(input.ports)) {
				for (const port of input.ports) {
					if (port.host && port.container) {
						dockerArgs.push("-p", `${port.host}:${port.container}`);
					}
				}
			}
			if (Array.isArray(input.volumes)) {
				for (const vol of input.volumes) {
					if (vol.host && vol.container) {
						dockerArgs.push("-v", `${vol.host}:${vol.container}`);
					}
				}
			}
			if (Array.isArray(input.envVars)) {
				for (const env of input.envVars) {
					if (env.key) {
						dockerArgs.push("-e", `${env.key}=${env.value || ""}`);
					}
				}
			}
			if (input.network?.trim()) {
				dockerArgs.push("--network", input.network.trim());
			}

			dockerArgs.push(image);

			if (input.command?.trim()) {
				const cmdParts = input.command.trim().match(/(?:[^\s"]+|"[^"]*")+/g) || [];
				dockerArgs.push(...cmdParts.map((part) => part.replace(/^"|"$/g, "")));
			}

			const result = await runDocker(dockerArgs, "image.pull");
			const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
			sendJson(response, result.ok ? 200 : 400, { ok: result.ok, output });
			return;
		}

		if (request.method === "POST" && pathName === "/terminal/sessions") {
			try {
				const payload = await readRequestJson(request);
				const sessionId = await createTerminalSession(payload);
				sendJson(response, 200, { sessionId });
			} catch (error) {
				sendJson(response, 400, {
					error: error instanceof Error ? error.message : "Unable to start terminal session.",
				});
			}
			return;
		}

		const terminalSessionMatch = pathName.match(/^\/terminal\/sessions\/([^/]+)$/);
		if (terminalSessionMatch) {
			const sessionId = decodeURIComponent(terminalSessionMatch[1]);
			const session = terminalSessions.get(sessionId);

			if (!session) {
				sendJson(response, 404, { error: "Terminal session not found." });
				return;
			}

			if (request.method === "GET") {
				const cursor = Number(url.searchParams.get("cursor") || 0);
				const chunks = session.events
					.filter((entry) => entry.cursor > cursor)
					.map((entry) => entry.data);
				const nextCursor = session.events.length
					? session.events[session.events.length - 1].cursor
					: cursor;
				sendJson(response, 200, {
					chunks,
					cursor: nextCursor,
					closed: session.closed,
					exitCode: session.exitCode,
				});
				return;
			}

			if (request.method === "POST") {
				const payload = await readRequestJson(request);
				if (payload.type === "input") {
					session.process.write(String(payload.data || "").slice(0, 8192));
					sendJson(response, 200, { ok: true });
					return;
				}

				if (payload.type === "resize") {
					session.resize(payload.cols, payload.rows);
					sendJson(response, 200, { ok: true });
					return;
				}

				sendJson(response, 400, { error: "Unsupported terminal operation." });
				return;
			}

			if (request.method === "DELETE") {
				closeTerminalSession(sessionId);
				sendJson(response, 200, { ok: true });
				return;
			}
		}

		if (request.method === "GET" && pathName === "/images") {
			sendJson(
				response,
				200,
				parseJsonLines((await runDocker(["images", "--digests", "--format", "{{json .}}"])).stdout),
			);
			return;
		}

		const imageMatch = pathName.match(/^\/images\/(.+)$/);
		if (request.method === "GET" && imageMatch) {
			const result = await runDocker(["image", "inspect", decodeURIComponent(imageMatch[1])]);
			sendJson(response, 200, parseJsonValue(result.stdout)?.[0] ?? null);
			return;
		}

		if (request.method === "POST" && pathName === "/images/pull") {
			const { imageRef } = await readRequestJson(request);
			const result = await runDocker(["pull", String(imageRef)]);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		if (request.method === "POST" && pathName === "/images/remove") {
			const { imageRef } = await readRequestJson(request);
			const result = await runDocker(["image", "rm", "-f", String(imageRef)]);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		if (request.method === "POST" && pathName === "/images/prune") {
			const { all } = await readRequestJson(request);
			const result = await runDocker(["image", "prune", "-f", ...(all ? ["-a"] : [])]);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		if (request.method === "GET" && pathName === "/volumes") {
			sendJson(
				response,
				200,
				parseJsonLines((await runDocker(["volume", "ls", "--format", "{{json .}}"])).stdout),
			);
			return;
		}

		const volumeMatch = pathName.match(/^\/volumes\/(.+)$/);
		if (request.method === "GET" && volumeMatch) {
			const result = await runDocker(["volume", "inspect", decodeURIComponent(volumeMatch[1])]);
			sendJson(response, 200, parseJsonValue(result.stdout)?.[0] ?? null);
			return;
		}

		if (request.method === "POST" && pathName === "/volumes/create") {
			const { name, driver } = await readRequestJson(request);
			const result = await runDocker([
				"volume",
				"create",
				"--driver",
				String(driver || "local"),
				String(name),
			]);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		if (request.method === "POST" && pathName === "/volumes/remove") {
			const { name } = await readRequestJson(request);
			const result = await runDocker(["volume", "rm", "-f", String(name)]);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		if (request.method === "POST" && pathName === "/volumes/prune") {
			const result = await runDocker(["volume", "prune", "-f"]);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		// POST /volumes/:name/backup — create a volume backup
		const volumeBackupMatch = pathName.match(/^\/volumes\/([^/]+)\/backup$/);
		if (request.method === "POST" && volumeBackupMatch) {
			const volumeName = decodeURIComponent(volumeBackupMatch[1]).replace(/[^a-zA-Z0-9._-]/g, "_");
			const { backupId } = await readRequestJson(request);
			const safeId = String(backupId).replace(/[^a-zA-Z0-9._-]/g, "_");
			const backupDir = path.join(dataDir, "backups");
			await mkdir(backupDir, { recursive: true });
			const fileName = `${safeId}.tar.gz`;
			const result = await runDocker(
				[
					"run",
					"--rm",
					"-v",
					`${volumeName}:/volume:ro`,
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
			sendJson(response, result.ok ? 200 : 400, {
				ok: result.ok,
				fileName,
				sizeBytes,
				output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
			});
			return;
		}

		// POST /volumes/:name/restore — restore a volume from backup
		const volumeRestoreMatch = pathName.match(/^\/volumes\/([^/]+)\/restore$/);
		if (request.method === "POST" && volumeRestoreMatch) {
			const volumeName = decodeURIComponent(volumeRestoreMatch[1]).replace(/[^a-zA-Z0-9._-]/g, "_");
			const { backupId } = await readRequestJson(request);
			const safeId = String(backupId).replace(/[^a-zA-Z0-9._-]/g, "_");
			const backupDir = path.join(dataDir, "backups");
			const fileName = `${safeId}.tar.gz`;
			const result = await runDocker(
				[
					"run",
					"--rm",
					"-v",
					`${volumeName}:/volume`,
					"-v",
					`${backupDir}:/backups`,
					"busybox",
					"sh",
					"-c",
					`rm -rf /volume/* && tar xzf /backups/${fileName} -C /volume`,
				],
				"prune",
			);
			sendJson(response, result.ok ? 200 : 400, {
				ok: result.ok,
				output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
			});
			return;
		}

		// DELETE /backups/:id — delete a backup file
		const backupDeleteMatch = pathName.match(/^\/backups\/([^/]+)$/);
		if (request.method === "DELETE" && backupDeleteMatch) {
			const safeId = decodeURIComponent(backupDeleteMatch[1]).replace(/[^a-zA-Z0-9._-]/g, "_");
			const backupDir = path.join(dataDir, "backups");
			const filePath = path.join(backupDir, `${safeId}.tar.gz`);
			try {
				await rm(filePath, { force: true });
				sendJson(response, 200, { ok: true });
			} catch (error) {
				sendJson(response, 400, {
					ok: false,
					error: error instanceof Error ? error.message : "Delete failed",
				});
			}
			return;
		}

		if (request.method === "GET" && pathName === "/networks") {
			sendJson(
				response,
				200,
				parseJsonLines((await runDocker(["network", "ls", "--format", "{{json .}}"])).stdout),
			);
			return;
		}

		const networkMatch = pathName.match(/^\/networks\/(.+)$/);
		if (request.method === "GET" && networkMatch) {
			const result = await runDocker(["network", "inspect", decodeURIComponent(networkMatch[1])]);
			sendJson(response, 200, parseJsonValue(result.stdout)?.[0] ?? null);
			return;
		}

		if (request.method === "POST" && pathName === "/networks/create") {
			const { name, driver } = await readRequestJson(request);
			const result = await runDocker([
				"network",
				"create",
				"--driver",
				String(driver || "bridge"),
				String(name),
			]);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		if (request.method === "POST" && pathName === "/networks/remove") {
			const { name } = await readRequestJson(request);
			const result = await runDocker(["network", "rm", String(name)]);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		if (request.method === "POST" && pathName === "/networks/prune") {
			const result = await runDocker(["network", "prune", "-f"]);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		response.end("Not found");
	});

	server.listen(listenPort, "0.0.0.0", () => {
		console.log(`dockroot-agent listening on 0.0.0.0:${listenPort}`);
	});
}

// ─── Docker Event Stream ───────────────────────────────────────

let dockerEventProcess = null;
let dockerEventBackoff = 3000;
const DOCKER_EVENT_MAX_BACKOFF = 30000;
const DOCKER_EVENT_ACTIONS = new Set([
	"start",
	"stop",
	"die",
	"destroy",
	"kill",
	"pause",
	"unpause",
]);
const dockrootInitiatedActions = new Map();

function registerAgentAction(containerId, action) {
	const key = `${containerId}:${action}`;
	dockrootInitiatedActions.set(key, Date.now());
	setTimeout(() => dockrootInitiatedActions.delete(key), 5000);
}

function isAgentInitiated(containerId, action) {
	return dockrootInitiatedActions.has(`${containerId}:${action}`);
}

function startDockerEventStream(state) {
	if (dockerEventProcess || !state.agentToken) {
		return;
	}

	const eventsUrl = `${state.managerUrl || managerUrl}/api/agent/events`;
	const eventBuffer = [];
	let flushTimer = null;

	function flushEvents() {
		if (!eventBuffer.length) {
			return;
		}
		const batch = eventBuffer.splice(0);
		fetch(eventsUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${state.agentToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(batch),
		}).catch((error) => {
			console.error("[docker-events] Failed to push events:", error.message);
		});
	}

	const child = spawn(
		"docker",
		["events", "--format", "{{json .}}", "--filter", "type=container"],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);

	dockerEventProcess = child;
	let buffer = "";

	child.stdout.on("data", (chunk) => {
		buffer += String(chunk);
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";

		for (const line of lines) {
			if (!line.trim()) {
				continue;
			}

			try {
				const event = JSON.parse(line);
				const action = event.Action || event.status || "";
				const containerId = event.Actor?.ID || event.id || "";
				const containerName = event.Actor?.Attributes?.name || "";

				if (!containerId || !DOCKER_EVENT_ACTIONS.has(action)) {
					continue;
				}

				if (isAgentInitiated(containerId, action)) {
					continue;
				}

				eventBuffer.push({ containerId, action, containerName });

				if (!flushTimer) {
					flushTimer = setTimeout(() => {
						flushTimer = null;
						flushEvents();
					}, 500);
				}
			} catch {
				// Ignore malformed JSON
			}
		}
	});

	child.on("close", (code) => {
		dockerEventProcess = null;
		console.error(
			`[docker-events] Process exited (code=${code}), restarting in ${dockerEventBackoff}ms...`,
		);
		setTimeout(() => {
			startDockerEventStream(state);
			dockerEventBackoff = Math.min(dockerEventBackoff * 2, DOCKER_EVENT_MAX_BACKOFF);
		}, dockerEventBackoff);
	});

	child.on("error", (error) => {
		dockerEventProcess = null;
		console.error("[docker-events] Failed to spawn:", error.message);
	});

	console.log("[docker-events] Listening for container events...");
}

// ─── Main Loop ─────────────────────────────────────────────────

async function loop() {
	let state = await loadState();

	// Start streaming docker stats early for instant metrics
	startAgentDockerStatsStream();

	while (true) {
		try {
			state = await ensureRegistered(state);
			const snapshot = await getSnapshot();
			await heartbeat(state, snapshot);

			// Start docker event stream once registered
			startDockerEventStream(state);

			const job = await pollJob(state);

			if (job.JOB_ID) {
				const reporter = createJobEventReporter(state, job.JOB_ID);
				const result = await runComposeJob(state, {
					...job,
					onChunk: (event) => reporter.push(event),
				});
				await reporter.flush();
				await reportJobResult(state, job.JOB_ID, result.status, result.log);
			}
		} catch (error) {
			metrics.connected = 0;
			console.error(error instanceof Error ? error.message : "dockroot-agent loop failed");
		}

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
}

await ensureDirectories();
startHttpServer();

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.once(signal, () => {
		console.log(`[agent] Received ${signal}, shutting down...`);
		stopAgentDockerStatsStream();
		process.exit(0);
	});
}

await loop();
