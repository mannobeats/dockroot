import { createHash } from "node:crypto";
import { createServer } from "node:http";
import os from "node:os";
import { listenPort, managerUrl, metrics } from "./config.mjs";
import {
	browseContainerPath,
	createVolumeBackup,
	deleteBackup,
	deleteContainerPath,
	getContainerDetails,
	getSnapshot,
	restoreVolumeBackup,
	runDocker,
	uploadContainerFile,
	writeContainerFile,
} from "./docker.mjs";
import { registerAgentAction } from "./docker-events.mjs";
import { runComposeJob } from "./jobs.mjs";
import { closeTerminalSession, createTerminalSession, getTerminalSession } from "./terminal.mjs";
import { loadState, parseJsonLines, parseJsonValue, stripAnsi } from "./utils.mjs";

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

function buildContainerRunArgs(input) {
	const name = String(input.name || "").trim();
	const image = String(input.image || "").trim();
	if (!name || !image) {
		return { error: "Name and image are required." };
	}
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
		return { error: "Invalid container name." };
	}

	const dockerArgs = ["run", "-d", "--name", name];

	if (input.memory?.trim()) {
		if (!/^\d+[bkmg]$/i.test(input.memory.trim())) {
			return { error: "Invalid memory format." };
		}
		dockerArgs.push("--memory", input.memory.trim());
	}
	if (input.cpus?.trim()) {
		const cpuVal = Number(input.cpus);
		if (!Number.isFinite(cpuVal) || cpuVal <= 0) {
			return { error: "CPUs must be a positive number." };
		}
		dockerArgs.push("--cpus", String(cpuVal));
	}
	if (input.restartPolicy?.trim()) {
		const policy = input.restartPolicy.trim();
		if (!["no", "always", "unless-stopped", "on-failure"].includes(policy)) {
			return { error: "Invalid restart policy." };
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
		for (const volume of input.volumes) {
			if (volume.host && volume.container) {
				dockerArgs.push("-v", `${volume.host}:${volume.container}`);
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

	return { dockerArgs };
}

export function startHttpServer() {
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

		if (request.method === "POST" && pathName === "/containers") {
			const input = await readRequestJson(request);
			const { dockerArgs, error } = buildContainerRunArgs(input);
			if (error) {
				sendJson(response, 400, { ok: false, output: error });
				return;
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
			const session = getTerminalSession(sessionId);

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

		const volumeBackupMatch = pathName.match(/^\/volumes\/([^/]+)\/backup$/);
		if (request.method === "POST" && volumeBackupMatch) {
			const { backupId } = await readRequestJson(request);
			const result = await createVolumeBackup(decodeURIComponent(volumeBackupMatch[1]), backupId);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		const volumeRestoreMatch = pathName.match(/^\/volumes\/([^/]+)\/restore$/);
		if (request.method === "POST" && volumeRestoreMatch) {
			const { backupId } = await readRequestJson(request);
			const result = await restoreVolumeBackup(decodeURIComponent(volumeRestoreMatch[1]), backupId);
			sendJson(response, result.ok ? 200 : 400, result);
			return;
		}

		const backupDeleteMatch = pathName.match(/^\/backups\/([^/]+)$/);
		if (request.method === "DELETE" && backupDeleteMatch) {
			try {
				await deleteBackup(decodeURIComponent(backupDeleteMatch[1]));
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
