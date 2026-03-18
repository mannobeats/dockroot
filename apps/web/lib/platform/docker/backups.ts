import "server-only";

import { rm } from "node:fs/promises";
import path from "node:path";
import { runDockerCommand } from "@/lib/platform/docker/command";
import { ensureDirectory, getPlatformDataDir } from "@/lib/platform/fs";

const BACKUP_DIR_NAME = "backups";

function getBackupDir() {
	return path.join(getPlatformDataDir(), BACKUP_DIR_NAME);
}

function sanitizeBackupInput(value: string) {
	return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function backupVolume(volumeName: string, backupId: string) {
	const safeVolume = sanitizeBackupInput(volumeName);
	const safeId = sanitizeBackupInput(backupId);
	const backupDir = getBackupDir();
	await ensureDirectory(backupDir);
	const fileName = `${safeId}.tar.gz`;

	const result = await runDockerCommand(
		[
			"run",
			"--rm",
			"-v",
			`${safeVolume}:/volume:ro`,
			"-v",
			`${backupDir}:/backups`,
			"busybox",
			"tar",
			"czf",
			`/backups/${fileName}`,
			"-C",
			"/volume",
			".",
		],
		"prune",
	);

	return {
		ok: result.ok,
		fileName,
		output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
	};
}

export async function restoreVolume(volumeName: string, backupId: string) {
	const safeVolume = sanitizeBackupInput(volumeName);
	const safeId = sanitizeBackupInput(backupId);
	const backupDir = getBackupDir();
	const fileName = `${safeId}.tar.gz`;

	const result = await runDockerCommand(
		[
			"run",
			"--rm",
			"-v",
			`${safeVolume}:/volume`,
			"-v",
			`${backupDir}:/backups`,
			"busybox",
			"sh",
			"-c",
			`rm -rf /volume/* && tar xzf /backups/${fileName} -C /volume`,
		],
		"prune",
	);

	return { ok: result.ok, output: [result.stdout, result.stderr].filter(Boolean).join("\n") };
}

export async function getBackupFileSize(backupId: string) {
	const safeId = sanitizeBackupInput(backupId);
	const filePath = path.join(getBackupDir(), `${safeId}.tar.gz`);
	try {
		const { stat } = await import("node:fs/promises");
		const stats = await stat(filePath);
		return stats.size;
	} catch {
		return null;
	}
}

export async function deleteBackupFile(backupId: string) {
	const safeId = sanitizeBackupInput(backupId);
	const filePath = path.join(getBackupDir(), `${safeId}.tar.gz`);
	try {
		await rm(filePath);
		return true;
	} catch {
		return false;
	}
}
