import { metrics, pollIntervalMs } from "./config.mjs";
import { getSnapshot } from "./docker.mjs";
import { startDockerEventStream } from "./docker-events.mjs";
import {
	createJobEventReporter,
	ensureRegistered,
	heartbeat,
	pollJob,
	reportJobResult,
	runComposeJob,
} from "./jobs.mjs";
import { startHttpServer } from "./server.mjs";
import { ensureDirectories, loadState } from "./utils.mjs";
import {
	isAgentWebSocketConnected,
	startAgentWebSocket,
	stopAgentWebSocket,
} from "./ws-connection.mjs";

async function loop() {
	let state = await loadState();

	while (true) {
		try {
			state = await ensureRegistered(state);

			// Start WebSocket connection if not already connected
			if (!isAgentWebSocketConnected()) {
				startAgentWebSocket(state);
			}

			// Always send heartbeat via HTTP (keeps agent status healthy in DB)
			const snapshot = await getSnapshot();
			await heartbeat(state, snapshot);

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
		stopAgentWebSocket();
		process.exit(0);
	});
}

await loop();
