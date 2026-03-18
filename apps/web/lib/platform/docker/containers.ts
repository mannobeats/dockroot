import "server-only";

import os from "node:os";
import { runDockerCommand } from "@/lib/platform/docker/command";
import { parseJsonLines, parseJsonValue, stripAnsi } from "@/lib/platform/docker/parsing";
import type { CreateContainerInput } from "@/lib/platform/docker/types";
import { emitRealtime, registerDockrootAction } from "@/lib/realtime";

const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MEMORY_REGEX = /^\d+[bkmg]$/i;

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

	const enrichedContainers = containers.map((row) => {
		const status = row.Status || "";
		let healthStatus: string | null = null;
		const healthMatch = status.match(/\((healthy|unhealthy|health: starting)\)/i);
		if (healthMatch) {
			const raw = healthMatch[1].toLowerCase();
			healthStatus = raw === "health: starting" ? "starting" : raw;
		}
		return { ...row, HealthStatus: healthStatus };
	});

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
		containers: enrichedContainers,
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

export async function getContainerDetails(containerId: string) {
	const [inspectResult, logsResult, statsResult] = await Promise.all([
		runDockerCommand(["inspect", containerId]),
		runDockerCommand(["logs", "--tail", "200", containerId]),
		runDockerCommand(
			["stats", "--no-stream", "--format", "{{json .}}", containerId],
			"container.stats",
		),
	]);

	let inspect = null;
	try {
		inspect = JSON.parse(inspectResult.stdout)[0] ?? null;
	} catch {
		inspect = null;
	}

	const rawHealth = inspect?.State?.Health ?? null;
	const health = rawHealth
		? {
				status: rawHealth.Status as string,
				failingStreak: (rawHealth.FailingStreak as number) || 0,
				log: (Array.isArray(rawHealth.Log) ? rawHealth.Log : [])
					.slice(-5)
					.map((entry: { Start?: string; End?: string; ExitCode?: number; Output?: string }) => ({
						start: entry.Start || null,
						end: entry.End || null,
						exitCode: entry.ExitCode ?? null,
						output: (entry.Output || "").trim(),
					})),
			}
		: null;

	return {
		inspect,
		logs: stripAnsi([logsResult.stdout, logsResult.stderr].filter(Boolean).join("\n")),
		stats: parseJsonLines<Record<string, string>>(statsResult.stdout)[0] ?? null,
		health,
	};
}

export async function listStackContainers(stackSlug: string) {
	const result = await runDockerCommand([
		"ps",
		"-a",
		"--filter",
		`label=com.docker.compose.project=${stackSlug}`,
		"--format",
		"{{json .}}",
	]);

	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function listContainers() {
	const result = await runDockerCommand(["ps", "-a", "--size", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function getContainerLogs(
	containerId: string,
	options?: { tail?: number; since?: string },
) {
	const args = ["logs", "--timestamps"];
	if (options?.tail) {
		args.push("--tail", String(options.tail));
	}
	if (options?.since) {
		args.push("--since", options.since);
	}
	args.push(containerId);

	const result = await runDockerCommand(args);
	return stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n"));
}

export async function controlContainer(
	containerId: string,
	action: "start" | "stop" | "restart" | "remove",
	options?: {
		removeVolumes?: boolean;
		auditContext?: {
			userId?: string;
			environmentId?: string;
			containerName?: string;
		};
	},
) {
	registerDockrootAction(containerId, action === "remove" ? "destroy" : action);

	const args =
		action === "remove"
			? ["rm", "-f", ...(options?.removeVolumes ? ["-v"] : []), containerId]
			: [action, containerId];
	const result = await runDockerCommand(args);
	const ok = result.ok;

	emitRealtime("container:state", {
		containerId,
		action,
		ok,
		at: Date.now(),
	});

	if (options?.auditContext?.userId) {
		try {
			const { db, runtimeActionEvents } = await import("@dockroot/db");
			await db.insert(runtimeActionEvents).values({
				id: crypto.randomUUID(),
				environmentId: options.auditContext.environmentId || null,
				actorUserId: options.auditContext.userId,
				actorRole: null,
				source: "server-action",
				actionType: `container.${action}`,
				status: ok ? "success" : "error",
				containerId,
				sessionId: null,
				details: JSON.stringify({
					containerName: options.auditContext.containerName || null,
					removeVolumes: options.removeVolumes || false,
					output: result.stderr || null,
				}),
				occurredAt: new Date(),
				createdAt: new Date(),
			});
		} catch {
			// Non-critical.
		}
	}

	return {
		ok,
		output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
	};
}

export async function createContainer(input: CreateContainerInput) {
	if (!CONTAINER_NAME_REGEX.test(input.name)) {
		return {
			ok: false,
			output:
				"Invalid container name. Use alphanumeric characters, dots, hyphens, and underscores.",
		};
	}
	if (!input.image.trim()) {
		return { ok: false, output: "Image is required." };
	}

	const args: string[] = ["run", "-d", "--name", input.name];

	if (input.memory?.trim()) {
		const mem = input.memory.trim();
		if (!MEMORY_REGEX.test(mem)) {
			return { ok: false, output: "Invalid memory format. Use e.g. 512m, 1g." };
		}
		args.push("--memory", mem);
	}

	if (input.cpus?.trim()) {
		const cpuVal = Number(input.cpus);
		if (!Number.isFinite(cpuVal) || cpuVal <= 0) {
			return { ok: false, output: "CPUs must be a positive number." };
		}
		args.push("--cpus", String(cpuVal));
	}

	if (input.restartPolicy?.trim()) {
		const policy = input.restartPolicy.trim();
		if (!["no", "always", "unless-stopped", "on-failure"].includes(policy)) {
			return { ok: false, output: "Invalid restart policy." };
		}
		args.push("--restart", policy);
	}

	if (input.ports?.length) {
		for (const port of input.ports) {
			if (port.host && port.container) {
				args.push("-p", `${port.host}:${port.container}`);
			}
		}
	}

	if (input.volumes?.length) {
		for (const vol of input.volumes) {
			if (vol.host && vol.container) {
				args.push("-v", `${vol.host}:${vol.container}`);
			}
		}
	}

	if (input.envVars?.length) {
		for (const env of input.envVars) {
			if (env.key) {
				args.push("-e", `${env.key}=${env.value || ""}`);
			}
		}
	}

	if (input.network?.trim()) {
		args.push("--network", input.network.trim());
	}

	args.push(input.image.trim());

	if (input.command?.trim()) {
		const cmdParts = input.command.trim().match(/(?:[^\s"]+|"[^"]*")+/g) || [];
		args.push(...cmdParts.map((part) => part.replace(/^"|"$/g, "")));
	}

	const result = await runDockerCommand(args, "image.pull");
	const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

	if (result.ok) {
		emitRealtime("container:state", {
			type: "created",
			containerId: result.stdout.trim().slice(0, 12),
			containerName: input.name,
		});
	}

	return { ok: result.ok, output };
}

export async function getImageDetails(imageRef: string) {
	const result = await runDockerCommand(["image", "inspect", imageRef]);
	return parseJsonValue<Record<string, unknown>[]>(result.stdout)?.[0] ?? null;
}

export async function listImages() {
	const result = await runDockerCommand(["images", "--digests", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function pullImage(imageRef: string) {
	return runDockerCommand(["pull", imageRef], "image.pull");
}

export async function removeImage(imageRef: string) {
	return runDockerCommand(["image", "rm", "-f", imageRef]);
}

export async function pruneImages(options?: { all?: boolean }) {
	return runDockerCommand(["image", "prune", "-f", ...(options?.all ? ["-a"] : [])], "prune");
}

export async function getVolumeDetails(volumeName: string) {
	const result = await runDockerCommand(["volume", "inspect", volumeName]);
	return parseJsonValue<Record<string, unknown>[]>(result.stdout)?.[0] ?? null;
}

export async function listVolumes() {
	const result = await runDockerCommand(["volume", "ls", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function createVolume(name: string, driver = "local") {
	return runDockerCommand(["volume", "create", "--driver", driver, name]);
}

export async function removeVolume(name: string) {
	return runDockerCommand(["volume", "rm", "-f", name]);
}

export async function pruneVolumes() {
	return runDockerCommand(["volume", "prune", "-f"], "prune");
}

export async function getNetworkDetails(networkName: string) {
	const result = await runDockerCommand(["network", "inspect", networkName]);
	return parseJsonValue<Record<string, unknown>[]>(result.stdout)?.[0] ?? null;
}

export async function listNetworks() {
	const result = await runDockerCommand(["network", "ls", "--format", "{{json .}}"]);
	return parseJsonLines<Record<string, string>>(result.stdout);
}

export async function createNetwork(name: string, driver = "bridge") {
	return runDockerCommand(["network", "create", "--driver", driver, name]);
}

export async function removeNetwork(name: string) {
	return runDockerCommand(["network", "rm", name]);
}

export async function pruneNetworks() {
	return runDockerCommand(["network", "prune", "-f"], "prune");
}
