import { execFile } from "node:child_process";
import { access, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { withTempFile } from "@/lib/platform/docker/files";
import { ensureDirectory } from "@/lib/platform/fs";

const execFileAsync = promisify(execFile);

export type StackWorkspaceInput = {
	stackDir: string;
	repoDir: string;
	sourceType: "manual" | "github";
	composeYaml: string;
	envFileContent?: string | null;
	sourceArchive: Buffer | null;
	composeFilePath?: string;
	envFilePath?: string;
	operation: "deploy" | "destroy";
};

export function resolveWorkspaceFilePath(
	rootDir: string,
	relativePath: string | undefined,
	fallback: string,
) {
	const candidate = (relativePath || fallback).trim() || fallback;
	const resolved = path.resolve(rootDir, candidate);
	const relative = path.relative(rootDir, resolved);

	if (
		!relative ||
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error("GitHub stack paths must stay within the repository workspace.");
	}

	return resolved;
}

async function extractRepositoryArchive(archive: Buffer, destinationDir: string) {
	await rm(destinationDir, { recursive: true, force: true });
	await ensureDirectory(destinationDir);

	await withTempFile("source.tar.gz", archive, async (archivePath) => {
		await execFileAsync(
			"tar",
			["-xzf", archivePath, "--strip-components=1", "-C", destinationDir],
			{ maxBuffer: 1024 * 1024 * 32 },
		);
	});
}

export async function prepareStackWorkspace(input: StackWorkspaceInput) {
	if (input.sourceType === "github") {
		if (input.operation === "deploy") {
			if (!input.sourceArchive) {
				throw new Error("GitHub deployments require a repository archive.");
			}
			await extractRepositoryArchive(input.sourceArchive, input.repoDir);
		} else {
			const repoExists = await access(input.repoDir)
				.then(() => true)
				.catch(() => false);

			if (!repoExists) {
				throw new Error("GitHub destroy requires an existing repository workspace on disk.");
			}
		}

		const composePath = resolveWorkspaceFilePath(
			input.repoDir,
			input.composeFilePath,
			"compose.yaml",
		);
		const defaultEnvPath = path.join(path.dirname(composePath), ".env");
		const envPath = input.envFilePath
			? resolveWorkspaceFilePath(input.repoDir, input.envFilePath, ".env")
			: input.envFileContent !== null && input.envFileContent !== undefined
				? defaultEnvPath
				: null;
		await ensureDirectory(path.dirname(composePath));
		await writeFile(composePath, input.composeYaml, "utf8");
		if (envPath && input.envFileContent !== null && input.envFileContent !== undefined) {
			await ensureDirectory(path.dirname(envPath));
			await writeFile(envPath, input.envFileContent || "", "utf8");
		}

		return {
			composePath,
			envPath,
			workingDirectory: path.dirname(composePath),
		};
	}

	const composePath = path.join(input.stackDir, "compose.yaml");
	const envPath = path.join(input.stackDir, ".env");
	await writeFile(composePath, input.composeYaml, "utf8");
	await writeFile(envPath, input.envFileContent || "", "utf8");

	return {
		composePath,
		envPath,
		workingDirectory: input.stackDir,
	};
}
