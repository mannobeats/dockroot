import { promises as fs } from "node:fs";
import path from "node:path";

const WORKSPACE_ROOT = process.cwd();
const SCAN_ROOTS = ["apps/web/app", "apps/web/lib", "apps/web/components", "server"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", ".next", ".turbo", ".git", "dist", "build"]);

const DEPRECATED_IMPORTS = [
	"@/lib/github-app-provider",
	"@/lib/github-app-state",
	"./github-app-provider",
	"./github-app-state",
	"../github-app-provider",
	"../github-app-state",
];

async function listSourceFiles(directory) {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		if (IGNORED_DIRECTORIES.has(entry.name)) {
			continue;
		}

		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listSourceFiles(absolutePath)));
			continue;
		}

		if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(absolutePath);
		}
	}

	return files;
}

function lineNumberFromIndex(content, index) {
	return content.slice(0, index).split("\n").length;
}

async function main() {
	const violations = [];
	const files = [];

	for (const root of SCAN_ROOTS) {
		const absoluteRoot = path.join(WORKSPACE_ROOT, root);
		files.push(...(await listSourceFiles(absoluteRoot)));
	}

	for (const filePath of files) {
		const content = await fs.readFile(filePath, "utf8");
		const relativePath = path.relative(WORKSPACE_ROOT, filePath);

		const wildcardExportRegex = /^\s*export\s+\*\s+from\s+["'][^"']+["'];?/gm;
		let wildcardMatch = wildcardExportRegex.exec(content);
		while (wildcardMatch) {
			violations.push({
				file: relativePath,
				line: lineNumberFromIndex(content, wildcardMatch.index),
				message: "Wildcard re-exports are disallowed. Export symbols explicitly.",
			});
			wildcardMatch = wildcardExportRegex.exec(content);
		}

		for (const importPath of DEPRECATED_IMPORTS) {
			const importRegex = new RegExp(`from\\s+["']${importPath.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}["']`, "g");
			let importMatch = importRegex.exec(content);
			while (importMatch) {
				violations.push({
					file: relativePath,
					line: lineNumberFromIndex(content, importMatch.index),
					message: `Deprecated import path \"${importPath}\" found. Use domain-scoped github-app modules instead.`,
				});
				importMatch = importRegex.exec(content);
			}
		}
	}

	if (violations.length === 0) {
		console.log("[structure] OK: no structure convention violations found.");
		return;
	}

	console.error("[structure] Convention violations detected:\n");
	for (const violation of violations) {
		console.error(`- ${violation.file}:${violation.line} ${violation.message}`);
	}
	process.exitCode = 1;
}

main().catch((error) => {
	console.error("[structure] Failed to run structure checks:", error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
