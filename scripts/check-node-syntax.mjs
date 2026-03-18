import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const CHECK_ROOTS = ["server", "scripts"];
const EXTRA_FILES = ["server.mjs", "local-terminal.mjs", "apps/web/postcss.config.mjs"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", ".turbo"]);

function listMjsFiles(directory) {
	const absolute = resolve(ROOT, directory);
	const entries = readdirSync(absolute, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		if (IGNORED_DIRS.has(entry.name)) {
			continue;
		}

		const relativePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...listMjsFiles(relativePath));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".mjs")) {
			files.push(relativePath);
		}
	}

	return files;
}

function unique(values) {
	return Array.from(new Set(values));
}

function runNodeSyntaxCheck(file) {
	return spawnSync(process.execPath, ["--check", resolve(ROOT, file)], {
		encoding: "utf8",
		stdio: "pipe",
	});
}

function main() {
	const files = unique([
		...EXTRA_FILES,
		...CHECK_ROOTS.flatMap((root) => listMjsFiles(root)),
	]).sort();

	const failures = [];
	for (const file of files) {
		const result = runNodeSyntaxCheck(file);
		if (result.status !== 0) {
			failures.push({ file, stderr: result.stderr?.trim() || "Unknown syntax error" });
		}
	}

	if (failures.length > 0) {
		console.error("[syntax] Node syntax check failed:\n");
		for (const failure of failures) {
			console.error(`- ${failure.file}\n${failure.stderr}\n`);
		}
		process.exitCode = 1;
		return;
	}

	console.log(`[syntax] OK: ${files.length} JavaScript entrypoints parsed successfully.`);
}

main();
