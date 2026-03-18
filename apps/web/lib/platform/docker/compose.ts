import "server-only";

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { runDockerCommand } from "@/lib/platform/docker/command";
import { listContainers } from "@/lib/platform/docker/containers";
import { parseJsonValue, stripAnsi } from "@/lib/platform/docker/parsing";
import type { ComposeProjectExport, ComposeProjectSummary } from "@/lib/platform/docker/types";
import { emitRealtime } from "@/lib/realtime";

export async function listComposeProjects(): Promise<ComposeProjectSummary[]> {
	const [composeResult, containers] = await Promise.all([
		runDockerCommand(["compose", "ls", "--all", "--format", "json"]),
		listContainers(),
	]);

	const parsed =
		parseJsonValue<Array<{ Name?: string; Status?: string; ConfigFiles?: string }>>(
			composeResult.stdout,
		) ?? [];

	const byProject = new Map<string, Array<Record<string, string>>>();

	for (const container of containers) {
		const labels = container.Labels || "";
		const composeProject = labels
			.split(",")
			.find((label) => label.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=");

		if (!composeProject) {
			continue;
		}

		const current = byProject.get(composeProject) || [];
		current.push(container);
		byProject.set(composeProject, current);
	}

	return parsed
		.filter((project) => project.Name)
		.map((project) => {
			const projectContainers = byProject.get(project.Name as string) || [];
			return {
				name: project.Name as string,
				status: project.Status || "unknown",
				configFiles: (project.ConfigFiles || "")
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean),
				containers: projectContainers,
				containerCount: projectContainers.length,
				runningCount: projectContainers.filter((container) => container.State === "running").length,
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

export async function controlComposeProject(
	projectName: string,
	configFiles: string[],
	action: "start" | "stop" | "restart" | "destroy",
	options?: {
		removeVolumes?: boolean;
		removeImages?: boolean;
	},
) {
	const composeArgs = configFiles.flatMap((configFile) => ["-f", configFile]);
	const operationArgs =
		action === "destroy"
			? [
					"down",
					"--remove-orphans",
					...(options?.removeVolumes ? ["-v"] : []),
					...(options?.removeImages ? ["--rmi", "local"] : []),
				]
			: action === "start"
				? ["start"]
				: action === "stop"
					? ["stop"]
					: ["restart"];

	const result = await runDockerCommand([
		"compose",
		"-p",
		projectName,
		...composeArgs,
		...operationArgs,
	]);

	emitRealtime("stack:state", {
		projectName,
		action,
		ok: result.ok,
		at: Date.now(),
	});

	return {
		ok: result.ok,
		output: stripAnsi([result.stdout, result.stderr].filter(Boolean).join("\n")),
	};
}

export async function exportComposeProjectConfig(
	projectName: string,
	configFiles: string[],
): Promise<ComposeProjectExport> {
	const args = [
		"compose",
		"-p",
		projectName,
		...configFiles.flatMap((configFile) => ["-f", configFile]),
		"config",
	];
	const result = await runDockerCommand(args);

	if (!result.ok || !result.stdout.trim()) {
		throw new Error(result.stderr || "Unable to export compose project config.");
	}

	const envPath = path.join(path.dirname(configFiles[0]), ".env");
	let envFileContent: string | null = null;

	try {
		await access(envPath);
		envFileContent = await readFile(envPath, "utf8");
	} catch {
		envFileContent = null;
	}

	return {
		projectName,
		composeYaml: result.stdout,
		envFileContent,
		configFiles,
	};
}
