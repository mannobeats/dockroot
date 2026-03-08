import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

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

const metrics = {
	registered: 0,
	connected: 0,
	lastHeartbeatTimestampSeconds: 0,
	lastJobFinishedTimestampSeconds: 0,
	lastPollTimestampSeconds: 0,
	jobsSucceeded: 0,
	jobsFailed: 0,
};

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

async function heartbeat(state) {
	await requestText(`${state.managerUrl || managerUrl}/api/agent/heartbeat`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${state.agentToken}`,
		},
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

async function runComposeJob(job) {
	const stackDir = path.join(stacksDir, job.STACK_SLUG);
	await mkdir(stackDir, { recursive: true });

	const composePath = path.join(stackDir, "compose.yaml");
	const envPath = path.join(stackDir, ".env");
	await writeFile(
		composePath,
		Buffer.from(job.COMPOSE_B64 || "", "base64").toString("utf8"),
		"utf8",
	);
	await writeFile(envPath, Buffer.from(job.ENV_B64 || "", "base64").toString("utf8"), "utf8");

	const args =
		job.OPERATION === "destroy"
			? [
					"compose",
					"-p",
					job.STACK_SLUG,
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
					"--env-file",
					envPath,
					"-f",
					composePath,
					"up",
					"-d",
					"--remove-orphans",
				];

	try {
		const result = await execFileAsync("docker", args, {
			maxBuffer: 1024 * 1024 * 16,
		});

		return {
			status: "succeeded",
			log: [result.stdout, result.stderr].filter(Boolean).join("\n"),
		};
	} catch (error) {
		return {
			status: "failed",
			log: error instanceof Error ? error.message : "Docker command failed",
		};
	}
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

function renderMetrics() {
	return [
		"# HELP dockroot_agent_registered Whether the agent has completed registration.",
		"# TYPE dockroot_agent_registered gauge",
		`dockroot_agent_registered ${metrics.registered}`,
		"# HELP dockroot_agent_connected Whether the last heartbeat succeeded.",
		"# TYPE dockroot_agent_connected gauge",
		`dockroot_agent_connected ${metrics.connected}`,
		"# HELP dockroot_agent_last_heartbeat_timestamp_seconds Unix timestamp of the last successful heartbeat.",
		"# TYPE dockroot_agent_last_heartbeat_timestamp_seconds gauge",
		`dockroot_agent_last_heartbeat_timestamp_seconds ${metrics.lastHeartbeatTimestampSeconds}`,
		"# HELP dockroot_agent_last_job_finished_timestamp_seconds Unix timestamp of the last completed job.",
		"# TYPE dockroot_agent_last_job_finished_timestamp_seconds gauge",
		`dockroot_agent_last_job_finished_timestamp_seconds ${metrics.lastJobFinishedTimestampSeconds}`,
		"# HELP dockroot_agent_last_poll_timestamp_seconds Unix timestamp of the last job poll.",
		"# TYPE dockroot_agent_last_poll_timestamp_seconds gauge",
		`dockroot_agent_last_poll_timestamp_seconds ${metrics.lastPollTimestampSeconds}`,
		"# HELP dockroot_agent_jobs_total Number of jobs completed by result.",
		"# TYPE dockroot_agent_jobs_total counter",
		`dockroot_agent_jobs_total{status="succeeded"} ${metrics.jobsSucceeded}`,
		`dockroot_agent_jobs_total{status="failed"} ${metrics.jobsFailed}`,
	].join("\n");
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

function startHttpServer() {
	const server = createServer(async (request, response) => {
		if (!request.url) {
			response.writeHead(404).end();
			return;
		}

		if (request.url === "/healthz") {
			const body = JSON.stringify(await readHealthSnapshot());
			response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
			response.end(body);
			return;
		}

		if (request.url === "/metrics") {
			response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
			response.end(renderMetrics());
			return;
		}

		response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		response.end("Not found");
	});

	server.listen(listenPort, "0.0.0.0", () => {
		console.log(`dockroot-agent listening on 0.0.0.0:${listenPort}`);
	});
}

async function loop() {
	let state = await loadState();

	while (true) {
		try {
			state = await ensureRegistered(state);
			await heartbeat(state);
			const job = await pollJob(state);

			if (job.JOB_ID) {
				const result = await runComposeJob(job);
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
await loop();
