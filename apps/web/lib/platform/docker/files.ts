import "server-only";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runDockerCommand } from "@/lib/platform/docker/command";
import { sanitizeTempFileName } from "@/lib/platform/docker/parsing";
import type { ContainerBrowserResult } from "@/lib/platform/docker/types";

const DEFAULT_CONTAINER_MUTATION_ROOTS = [
	"/app",
	"/workspace",
	"/config",
	"/tmp",
	"/var/www",
	"/usr/src/app",
	"/srv/app",
	"/home/node/app",
];

function normalizeContainerPath(inputPath: string, options?: { allowRoot?: boolean }) {
	const rawValue = String(inputPath || "").trim();
	if (!rawValue) {
		throw new Error("Container path is required.");
	}

	const normalized = path.posix.normalize(rawValue);
	if (!normalized.startsWith("/")) {
		throw new Error("Container paths must be absolute.");
	}
	if (!options?.allowRoot && normalized === "/") {
		throw new Error("Refusing to target the container root directory.");
	}

	return normalized;
}

function getAllowedContainerMutationRoots() {
	const configured = String(process.env.DOCKROOT_CONTAINER_MUTATION_ROOTS || "").trim();
	if (configured === "*") {
		return "*";
	}
	const roots = (configured ? configured.split(",") : DEFAULT_CONTAINER_MUTATION_ROOTS)
		.map((value) => normalizeContainerPath(value, { allowRoot: false }))
		.filter(Boolean);

	return Array.from(new Set(roots));
}

function assertAllowedContainerMutationPath(targetPath: string, options?: { directory?: boolean }) {
	const normalized = normalizeContainerPath(targetPath, { allowRoot: false });
	const allowedRoots = getAllowedContainerMutationRoots();
	if (allowedRoots === "*") {
		return normalized;
	}

	const matchesAllowedRoot = allowedRoots.some(
		(root) => normalized === root || normalized.startsWith(`${root}/`),
	);
	if (!matchesAllowedRoot) {
		const noun = options?.directory ? "directory" : "path";
		throw new Error(
			`Refusing to modify container ${noun} outside allowed roots (${allowedRoots.join(", ")}).`,
		);
	}

	return normalized;
}

export async function withTempFile<T>(
	fileName: string,
	content: Buffer | string,
	run: (filePath: string) => Promise<T>,
) {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "dockroot-"));
	const safeFileName = sanitizeTempFileName(fileName);
	const tempFile = path.join(tempDir, safeFileName);

	try {
		await writeFile(tempFile, content);
		return await run(tempFile);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export async function writeContainerFile(containerId: string, targetPath: string, content: string) {
	const normalizedPath = assertAllowedContainerMutationPath(targetPath);
	const fileName = path.basename(normalizedPath) || "file.txt";
	return withTempFile(fileName, content, async (tempFile) => {
		const parentPath = path.posix.dirname(normalizedPath);
		await runDockerCommand([
			"exec",
			"-e",
			`TARGET_PARENT=${parentPath}`,
			containerId,
			"sh",
			"-lc",
			'mkdir -p -- "$TARGET_PARENT"',
		]);
		return runDockerCommand(["cp", tempFile, `${containerId}:${normalizedPath}`]);
	});
}

export async function uploadContainerFile(
	containerId: string,
	targetDirectory: string,
	fileName: string,
	content: Buffer,
) {
	const safeFileName = sanitizeTempFileName(path.posix.basename(String(fileName || "").trim()));
	const normalizedDirectory = assertAllowedContainerMutationPath(targetDirectory, {
		directory: true,
	});
	return withTempFile(safeFileName, content, async (tempFile) => {
		await runDockerCommand([
			"exec",
			"-e",
			`TARGET_DIRECTORY=${normalizedDirectory}`,
			containerId,
			"sh",
			"-lc",
			'mkdir -p -- "$TARGET_DIRECTORY"',
		]);
		return runDockerCommand([
			"cp",
			tempFile,
			`${containerId}:${normalizedDirectory.replace(/\/$/, "")}/${safeFileName}`,
		]);
	});
}

export async function deleteContainerPath(containerId: string, targetPath: string) {
	const normalizedPath = assertAllowedContainerMutationPath(targetPath);
	return runDockerCommand([
		"exec",
		"-e",
		`TARGET_PATH=${normalizedPath}`,
		containerId,
		"sh",
		"-lc",
		'rm -rf -- "$TARGET_PATH"',
	]);
}

export async function browseContainerPath(
	containerId: string,
	targetPath: string,
): Promise<ContainerBrowserResult> {
	const normalizedPath = normalizeContainerPath(targetPath, { allowRoot: true });
	const result = await runDockerCommand([
		"exec",
		"-e",
		`TARGET_PATH=${normalizedPath}`,
		containerId,
		"sh",
		"-lc",
		`
if [ -d "$TARGET_PATH" ]; then
  echo "__DIR__"
  for entry in "$TARGET_PATH"/* "$TARGET_PATH"/.[!.]* "$TARGET_PATH"/..?*; do
    [ ! -e "$entry" ] && continue
    name=$(basename "$entry")
    if [ -d "$entry" ]; then
      printf "dir\\t%s\\n" "$name"
    elif [ -f "$entry" ]; then
      printf "file\\t%s\\n" "$name"
    else
      printf "other\\t%s\\n" "$name"
    fi
  done
elif [ -f "$TARGET_PATH" ]; then
  echo "__FILE__"
  sed -n '1,240p' "$TARGET_PATH"
else
  echo "__MISSING__"
fi
		`,
	]);

	const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

	if (output.startsWith("__DIR__")) {
		const entries = output
			.split("\n")
			.slice(1)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const [kind, ...rest] = line.split("\t");
				return {
					kind: (kind as "dir" | "file" | "other") || "other",
					name: rest.join("\t"),
				};
			})
			.sort((left, right) => {
				if (left.kind === right.kind) {
					return left.name.localeCompare(right.name);
				}
				return left.kind === "dir" ? -1 : 1;
			});

		return {
			kind: "directory",
			path: normalizedPath,
			entries,
		};
	}

	if (output.startsWith("__FILE__")) {
		return {
			kind: "file",
			path: normalizedPath,
			content: output.split("\n").slice(1).join("\n"),
		};
	}

	return {
		kind: "missing",
		path: normalizedPath,
	};
}
