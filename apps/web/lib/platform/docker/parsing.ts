import "server-only";

import path from "node:path";

export function sanitizeTempFileName(fileName: string) {
	const base = path.basename(String(fileName || "").trim());
	const cleaned = base
		.replaceAll(/[^A-Za-z0-9._-]/g, "_")
		.replace(/^\.+/, "")
		.slice(0, 128);
	return cleaned || "upload.bin";
}

export function parseJsonLines<T>(content: string) {
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as T];
			} catch {
				return [];
			}
		});
}

export function parseJsonValue<T>(content: string) {
	try {
		return JSON.parse(content) as T;
	} catch {
		return null;
	}
}

export function stripAnsi(content: string) {
	const esc = String.fromCharCode(27);
	const bell = String.fromCharCode(7);
	return content
		.replaceAll(new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, "g"), "")
		.replaceAll(new RegExp(`${esc}\\][^${bell}]*${bell}`, "g"), "");
}
