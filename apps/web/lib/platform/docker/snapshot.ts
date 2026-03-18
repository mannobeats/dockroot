import "server-only";

import os from "node:os";
import { runDockerCommand } from "@/lib/platform/docker/command";
import { parseJsonLines } from "@/lib/platform/docker/parsing";

function enrichContainerHealth(row: Record<string, string>) {
	const status = row.Status || "";
	let healthStatus: string | null = null;
	const healthMatch = status.match(/\((healthy|unhealthy|health: starting)\)/i);
	if (healthMatch) {
		const raw = healthMatch[1].toLowerCase();
		healthStatus = raw === "health: starting" ? "starting" : raw;
	}
	return { ...row, HealthStatus: healthStatus };
}

export async function getLocalDockerSnapshot() {
	const [ps, images, volumes, networks, version, stats] = await Promise.all([
		runDockerCommand(["ps", "-a", "--size", "--format", "{{json .}}"]),
		runDockerCommand(["images", "--digests", "--format", "{{json .}}"]),
		runDockerCommand(["volume", "ls", "--format", "{{json .}}"]),
		runDockerCommand(["network", "ls", "--format", "{{json .}}"]),
		runDockerCommand(["version", "--format", "{{.Server.Version}}"]),
		runDockerCommand(["stats", "--no-stream", "--format", "{{json .}}"], "container.stats"),
	]);

	const containers = parseJsonLines<Record<string, string>>(ps.stdout);
	const imageRows = parseJsonLines<Record<string, string>>(images.stdout);
	const volumeRows = parseJsonLines<Record<string, string>>(volumes.stdout);
	const networkRows = parseJsonLines<Record<string, string>>(networks.stdout);
	const statsRows = parseJsonLines<Record<string, string>>(stats.stdout);
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
			hostname:
				process.platform === "win32" ? process.env.COMPUTERNAME || "unknown" : os.hostname(),
			platform: `${os.platform()} ${os.release()}`,
			architecture: os.arch(),
			dockerVersion: version.stdout.trim() || "unknown",
			cpus: os.cpus().length,
			totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
			freeMemoryGb: Number((os.freemem() / 1024 / 1024 / 1024).toFixed(1)),
		},
		containers: containers.map(enrichContainerHealth),
		images: imageRows,
		volumes: volumeRows,
		networks: networkRows,
		counts: {
			containers: containers.length,
			runningContainers: containers.filter((row) => row.State === "running").length,
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
