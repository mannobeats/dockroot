import { db, volumeBackups } from "@dockroot/db";
import { and, desc, eq, inArray } from "drizzle-orm";

export type VolumeBackupRecord = {
	id: string;
	volumeName: string;
	fileName: string;
	sizeBytes: number | null;
	status: "in_progress" | "completed" | "failed";
	error: string | null;
	createdAt: Date;
	completedAt: Date | null;
};

export async function listVolumeBackupsForUser({
	userId,
	environmentId,
	volumeNames,
}: {
	userId: string;
	environmentId: string;
	volumeNames?: string[];
}) {
	if (volumeNames && !volumeNames.length) {
		return {} as Record<string, VolumeBackupRecord[]>;
	}

	const rows = await db.query.volumeBackups.findMany({
		where: and(
			eq(volumeBackups.environmentId, environmentId),
			eq(volumeBackups.createdByUserId, userId),
			volumeNames?.length ? inArray(volumeBackups.volumeName, volumeNames) : undefined,
		),
		orderBy: [desc(volumeBackups.createdAt)],
		limit: volumeNames?.length ? Math.max(volumeNames.length * 12, 50) : 50,
	});

	return rows.reduce<Record<string, VolumeBackupRecord[]>>((acc, row) => {
		const key = row.volumeName;
		if (!acc[key]) {
			acc[key] = [];
		}
		acc[key].push(row);
		return acc;
	}, {});
}
