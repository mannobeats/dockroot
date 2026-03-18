import { spawn } from "node:child_process";
import { managerUrl } from "./config.mjs";

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

export function registerAgentAction(containerId, action) {
	const key = `${containerId}:${action}`;
	dockrootInitiatedActions.set(key, Date.now());
	setTimeout(() => dockrootInitiatedActions.delete(key), 5000);
}

function isAgentInitiated(containerId, action) {
	return dockrootInitiatedActions.has(`${containerId}:${action}`);
}

export function startDockerEventStream(state) {
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
