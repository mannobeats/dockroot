import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DockerCommandResult } from "@/lib/platform/docker/types";

const execFileAsync = promisify(execFile);

const DOCKER_OPERATION_TIMEOUTS: Record<string, number> = {
	default: 30_000,
	"image.pull": 10 * 60_000,
	"container.stats": 15_000,
	prune: 2 * 60_000,
};

function getOperationTimeoutMs(operation?: string): number {
	if (operation && DOCKER_OPERATION_TIMEOUTS[operation]) {
		return DOCKER_OPERATION_TIMEOUTS[operation];
	}
	const configured = Number(process.env.DOCKROOT_DOCKER_COMMAND_TIMEOUT_MS || "");
	if (Number.isFinite(configured) && configured > 0) {
		return Math.max(5_000, Math.min(10 * 60_000, Math.floor(configured)));
	}
	return DOCKER_OPERATION_TIMEOUTS.default;
}

export async function runDockerCommand(
	args: string[],
	operation?: string,
): Promise<DockerCommandResult> {
	try {
		const result = await execFileAsync("docker", args, {
			maxBuffer: 1024 * 1024 * 8,
			timeout: getOperationTimeoutMs(operation),
			killSignal: "SIGTERM",
		});
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			code: 0,
			ok: true,
		} satisfies DockerCommandResult;
	} catch (error) {
		const execError = error as {
			stdout?: string;
			stderr?: string;
			code?: number;
			signal?: string | null;
			message?: string;
		};
		const code = typeof execError?.code === "number" ? execError.code : 1;
		const stderr =
			typeof execError?.stderr === "string" && execError.stderr.trim()
				? execError.stderr
				: execError?.signal
					? `Docker command terminated by signal ${execError.signal}.`
					: execError?.message || "Docker command failed";
		return {
			stdout: typeof execError?.stdout === "string" ? execError.stdout : "",
			stderr,
			code,
			ok: false,
		} satisfies DockerCommandResult;
	}
}
