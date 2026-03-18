import "server-only";

import { runDockerCommand } from "@/lib/platform/docker/command";
import { parseJsonLines, stripAnsi } from "@/lib/platform/docker/parsing";
import type { CreateContainerInput } from "@/lib/platform/docker/types";
import { emitRealtime, registerDockrootAction } from "@/lib/realtime";

const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MEMORY_REGEX = /^\d+[bkmg]$/i;

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
