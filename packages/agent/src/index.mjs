import { metrics, pollIntervalMs } from "./config.mjs";
import { getSnapshot } from "./docker.mjs";
import { startDockerEventStream } from "./docker-events.mjs";
import { startAgentDockerStatsStream, stopAgentDockerStatsStream } from "./docker-stats.mjs";
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

async function loop() {
	let state = await loadState();

	startAgentDockerStatsStream();

	while (true) {
		try {
			state = await ensureRegistered(state);
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
		stopAgentDockerStatsStream();
		process.exit(0);
	});
}

await loop();
