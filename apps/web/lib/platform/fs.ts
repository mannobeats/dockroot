import "server-only";

import { mkdir } from "node:fs/promises";
import path from "node:path";

export function getPlatformDataDir() {
	return process.env.DOCKROOT_DATA_DIR || path.join(process.cwd(), ".dockroot");
}

export async function ensureDirectory(dirPath: string) {
	await mkdir(dirPath, { recursive: true });
	return dirPath;
}
