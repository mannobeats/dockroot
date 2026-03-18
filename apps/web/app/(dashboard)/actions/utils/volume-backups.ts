import { db as dbClient, volumeBackups } from "@dockroot/db";
import { eq } from "drizzle-orm";

export async function createVolumeBackupRecord(input: {
	backupId: string;
	environmentId: string;
	volumeName: string;
	userId: string;
}) {
	await dbClient.insert(volumeBackups).values({
		id: input.backupId,
		environmentId: input.environmentId,
		volumeName: input.volumeName,
		fileName: `${input.backupId}.tar.gz`,
		status: "in_progress",
		createdByUserId: input.userId,
		createdAt: new Date(),
	});
}

export async function markVolumeBackupCompleted(input: {
	backupId: string;
	sizeBytes?: number | null;
}) {
	await dbClient
		.update(volumeBackups)
		.set({
			status: "completed",
			sizeBytes: input.sizeBytes ?? undefined,
			completedAt: new Date(),
		})
		.where(eq(volumeBackups.id, input.backupId));
}

export async function markVolumeBackupFailed(input: { backupId: string; errorMessage: string }) {
	await dbClient
		.update(volumeBackups)
		.set({
			status: "failed",
			error: input.errorMessage,
			completedAt: new Date(),
		})
		.where(eq(volumeBackups.id, input.backupId));
}

export async function removeVolumeBackupRecord(backupId: string) {
	await dbClient.delete(volumeBackups).where(eq(volumeBackups.id, backupId));
}
