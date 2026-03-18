import type { VolumeBackupRecord } from "@/lib/volume-backups";
import type { BackupSummary } from "./types";

export function formatBytes(bytes: number | null) {
	if (bytes === null || bytes === undefined) {
		return "—";
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(date: Date | string | null) {
	if (!date) {
		return "—";
	}
	const resolvedDate = typeof date === "string" ? new Date(date) : date;
	return resolvedDate.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function summarizeBackups(backups: VolumeBackupRecord[]): BackupSummary {
	const completed = backups.filter((backup) => backup.status === "completed").length;
	const failed = backups.filter((backup) => backup.status === "failed").length;
	const inProgress = backups.filter((backup) => backup.status === "in_progress").length;
	return { completed, failed, inProgress };
}
