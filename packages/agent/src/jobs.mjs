import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { managerUrl, metrics, registrationToken, stacksDir } from "./config.mjs";
import {
	detectDockerVersion,
	execFileAsync,
	parseEnvPayload,
	pathExists,
	requestBuffer,
	requestText,
	saveState,
	withTempFile,
} from "./utils.mjs";

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

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAttempts(operation) {
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

function isRetryableComposeFailure(output) {
	return TRANSIENT_COMPOSE_FAILURE_PATTERNS.some((pattern) => pattern.test(output));
}

function buildComposeArgs(job, composePath, envPath, workingDirectory) {
	return job.OPERATION === "destroy"
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
}

async function runDockerComposeOnce(args, publishChunk) {
	let output = "";
	const child = spawn("docker", args, {
		stdio: ["ignore", "pipe", "pipe"],
	});

	const onChunk = (chunk, stream) => {
		const message = chunk.toString();
		output += message;
		publishChunk(message, stream);
	};

	child.stdout.on("data", (chunk) => onChunk(chunk, "stdout"));
	child.stderr.on("data", (chunk) => onChunk(chunk, "stderr"));

	const exitCode = await new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 1));
	});

	return {
		exitCode,
		output,
	};
}

function getAdvertisedAgentUrl() {
	const explicitUrl = (process.env.DOCKROOT_AGENT_URL || "").trim();
	if (explicitUrl) {
		return explicitUrl.replace(/\/$/, "");
	}

	return null;
}

export async function ensureRegistered(state) {
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

export async function heartbeat(state, snapshot) {
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

export async function pollJob(state) {
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
			const repoExists = await pathExists(repoDir);

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

export async function runComposeJob(state, job) {
	try {
		const { composePath, envPath, workingDirectory } = await prepareComposeWorkspace(state, job);

		const args = buildComposeArgs(job, composePath, envPath, workingDirectory);
		const maxAttempts = getRetryAttempts(job.OPERATION);
		const baseDelayMs = getRetryBaseDelayMs();
		let output = "";

		const publishChunk = (message, stream) => {
			output += message;
			job.onChunk?.({
				stream,
				message,
				at: Date.now(),
			});
		};

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			if (maxAttempts > 1) {
				publishChunk(`[agent] docker compose attempt ${attempt}/${maxAttempts}\n`, "stdout");
			}

			const result = await runDockerComposeOnce(args, publishChunk);
			if (result.exitCode === 0) {
				return {
					status: "succeeded",
					log: output.trim() || "docker compose completed successfully.",
				};
			}

			const shouldRetry =
				attempt < maxAttempts &&
				job.OPERATION !== "destroy" &&
				isRetryableComposeFailure(result.output);
			if (!shouldRetry) {
				return {
					status: "failed",
					log: output.trim() || `docker compose exited with code ${result.exitCode}`,
				};
			}

			const delayMs = baseDelayMs * 2 ** (attempt - 1);
			publishChunk(
				`[agent] transient Docker registry/network failure detected; retrying in ${Math.ceil(delayMs / 1000)}s...\n`,
				"stderr",
			);
			await sleep(delayMs);
		}

		return {
			status: "failed",
			log: output.trim() || "docker compose failed after retry attempts.",
		};
	} catch (error) {
		return {
			status: "failed",
			log: error instanceof Error ? error.message : "Docker command failed",
		};
	}
}

export function createJobEventReporter(state, jobId) {
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

export async function reportJobResult(state, jobId, status, log) {
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
