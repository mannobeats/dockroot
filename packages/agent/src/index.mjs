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

async function runDocker(args) {
	try {
		const result = await execFileAsync("docker", args, {
			maxBuffer: 1024 * 1024 * 16,
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

async function requireAgentAuth(request) {
	const state = await loadState();
	const header = request.headers.authorization || "";
	if (!state.agentToken || header !== `Bearer ${state.agentToken}`) {
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

async function getSnapshot() {
	const [containers, images, volumes, networks] = await Promise.all([
		runDocker(["ps", "-a", "--size", "--format", "{{json .}}"]),
		runDocker(["images", "--digests", "--format", "{{json .}}"]),
		runDocker(["volume", "ls", "--format", "{{json .}}"]),
		runDocker(["network", "ls", "--format", "{{json .}}"]),
	]);
	const containerRows = parseJsonLines(containers.stdout);
	const imageRows = parseJsonLines(images.stdout);
	const volumeRows = parseJsonLines(volumes.stdout);
	const networkRows = parseJsonLines(networks.stdout);

	return {
		host: {
			hostname: os.hostname(),
			platform: `${os.platform()} ${os.release()}`,
			architecture: os.arch(),
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
	};
}

async function getContainerDetails(containerId) {
	const [inspectResult, logsResult, statsResult] = await Promise.all([
		runDocker(["inspect", containerId]),
		runDocker(["logs", "--tail", "200", containerId]),
		runDocker(["stats", "--no-stream", "--format", "{{json .}}", containerId]),
	]);

	return {
		inspect: parseJsonValue(inspectResult.stdout)?.[0] ?? null,
		logs: stripAnsi([logsResult.stdout, logsResult.stderr].filter(Boolean).join("\n")),
		stats: parseJsonLines(statsResult.stdout)[0] ?? null,
	};
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

		if (pathName === "/metrics") {
			response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
			response.end(renderMetrics());
			return;
		}

		const authedState = await requireAgentAuth(request);
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

		const containerActionsMatch = pathName.match(/^\/containers\/([^/]+)\/actions$/);
		if (request.method === "POST" && containerActionsMatch) {
			const { action } = await readRequestJson(request);
			const containerId = decodeURIComponent(containerActionsMatch[1]);
			const args = action === "remove" ? ["rm", "-f", containerId] : [String(action), containerId];
			const result = await runDocker(args);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
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
