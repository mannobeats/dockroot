import { spawn } from "node:child_process";

const DOCKER_EVENT_MAX_BACKOFF = 30_000;

export function createDockerEventService({ io, dockerBinary, emitRuntimeAction, isShuttingDown }) {
	const dockrootInitiatedActions = new Map();
	let dockerEventProcess = null;
	let dockerEventBackoff = 3_000;

	function registerDockrootAction(containerId, action) {
		const key = `${containerId}:${action}`;
		dockrootInitiatedActions.set(key, Date.now());
		setTimeout(() => dockrootInitiatedActions.delete(key), 5_000);
	}

	function isDockrootInitiated(containerId, action) {
		const key = `${containerId}:${action}`;
		return dockrootInitiatedActions.has(key);
	}

	function startDockerEventStream() {
		if (dockerEventProcess) {
			return;
		}

		const child = spawn(
			dockerBinary,
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

					if (!containerId || !["start", "stop", "die", "destroy", "kill", "pause", "unpause"].includes(action)) {
						continue;
					}

					if (isDockrootInitiated(containerId, action)) {
						continue;
					}

					io.emit("container:state", {
						containerId,
						action,
						ok: true,
						at: Date.now(),
						source: "daemon",
					});

					emitRuntimeAction(`container.external.${action}`, {
						containerId,
						containerName,
						environmentId: null,
					});
				} catch {
					// Ignore malformed JSON lines.
				}
			}
		});

		child.on("close", (code) => {
			dockerEventProcess = null;
			if (!isShuttingDown()) {
				console.error(`[docker-events] Process exited (code=${code}), restarting in ${dockerEventBackoff}ms...`);
				setTimeout(() => {
					startDockerEventStream();
					dockerEventBackoff = Math.min(dockerEventBackoff * 2, DOCKER_EVENT_MAX_BACKOFF);
				}, dockerEventBackoff);
			}
		});

		child.on("error", (error) => {
			dockerEventProcess = null;
			console.error("[docker-events] Failed to spawn:", error.message);
		});

		child.stdout.once("data", () => {
			dockerEventBackoff = 3_000;
		});
	}

	function stopDockerEventStream() {
		if (!dockerEventProcess) {
			return;
		}

		dockerEventProcess.kill("SIGTERM");
		dockerEventProcess = null;
	}

	return {
		registerDockrootAction,
		startDockerEventStream,
		stopDockerEventStream,
	};
}
