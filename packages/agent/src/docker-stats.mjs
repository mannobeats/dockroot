import { spawn } from "node:child_process";

let agentDockerStatsProcess = null;
let agentLatestContainerStats = [];
let agentShuttingDown = false;

export function startAgentDockerStatsStream() {
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

export function stopAgentDockerStatsStream() {
	agentShuttingDown = true;
	if (agentDockerStatsProcess) {
		agentDockerStatsProcess.kill("SIGTERM");
		agentDockerStatsProcess = null;
	}
}

export function getLatestContainerStats() {
	return agentLatestContainerStats;
}
