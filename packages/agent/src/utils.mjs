import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { stacksDir, statePath } from "./config.mjs";

export const execFileAsync = promisify(execFile);

export function parseJsonLines(content) {
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line)];
			} catch {
				return [];
			}
		});
}

export function parseJsonValue(content) {
	try {
		return JSON.parse(content);
	} catch {
		return null;
	}
}

export function stripAnsi(content) {
	const esc = String.fromCharCode(27);
	const bell = String.fromCharCode(7);
	return content
		.replaceAll(new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, "g"), "")
		.replaceAll(new RegExp(`${esc}\\][^${bell}]*${bell}`, "g"), "");
}

export async function ensureDirectories() {
	await mkdir(stacksDir, { recursive: true });
}

export async function loadState() {
	try {
		const raw = await readFile(statePath, "utf8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

export async function saveState(state) {
	await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function parseEnvPayload(content) {
	return Object.fromEntries(
		content
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const index = line.indexOf("=");
				if (index < 0) {
					return [line, ""];
				}
				return [line.slice(0, index), line.slice(index + 1)];
			}),
	);
}

export async function requestText(url, options = {}) {
	const response = await fetch(url, options);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(text || `Request failed for ${url}`);
	}
	return text;
}

export async function requestBuffer(url, options = {}) {
	const response = await fetch(url, options);
	const buffer = Buffer.from(await response.arrayBuffer());
	if (!response.ok) {
		throw new Error(buffer.toString("utf8") || `Request failed for ${url}`);
	}
	return buffer;
}

export async function detectDockerVersion() {
	try {
		const { stdout } = await execFileAsync("docker", [
			"version",
			"--format",
			"{{.Server.Version}}",
		]);
		return stdout.trim() || "unknown";
	} catch {
		return "unknown";
	}
}

export async function withTempFile(fileName, content, run) {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "dockroot-agent-"));
	const tempFile = path.join(tempDir, fileName);

	try {
		await writeFile(tempFile, content);
		return await run(tempFile);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export async function pathExists(targetPath) {
	return access(targetPath)
		.then(() => true)
		.catch(() => false);
}
