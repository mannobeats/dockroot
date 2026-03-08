import "server-only";

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export function getPlatformDataDir() {
	return process.env.DOCKROOT_DATA_DIR || path.join(process.cwd(), ".dockroot");
}

export async function ensureDirectory(dirPath: string) {
	await mkdir(dirPath, { recursive: true });
	return dirPath;
}

export async function removeDirectory(dirPath: string) {
	await rm(dirPath, { recursive: true, force: true });
}
