"use server";

import { revalidatePath } from "next/cache";
import { normalizeInUseDeleteError } from "@/app/(dashboard)/actions/utils/errors";
import {
	getValue,
	getValues,
	requireDestructiveConfirmation,
} from "@/app/(dashboard)/actions/utils/form-data";
import { requirePrivilegedSession, requireUserSession } from "@/lib/authorization";
import {
	createVolumeForEnvironment,
	pruneVolumesForEnvironment,
	removeVolumeForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";

export async function createVolumeAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const driver = getValue(formData, "driver") || "local";
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!name) {
		throw new Error("Volume name is required");
	}

	await createVolumeForEnvironment(auth.userId, name, driver, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.create",
		details: { volumeName: name, driver },
	});
	revalidatePath("/dashboard/volumes");
}

export async function removeVolumeAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!name) {
		throw new Error("Volume name is required");
	}

	try {
		await removeVolumeForEnvironment(auth.userId, name, environmentId);
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			environmentId,
			userId: auth.userId,
			actionType: "volume.remove",
			details: { volumeName: name },
		});
	} catch (error) {
		throw normalizeInUseDeleteError("volume", name, error);
	}
	revalidatePath("/dashboard/volumes");
}

export async function bulkRemoveVolumesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const names = getValues(formData, "names");
	const environmentId = getValue(formData, "environmentId") || undefined;
	if (!names.length) {
		throw new Error("At least one volume is required.");
	}

	for (const name of Array.from(new Set(names))) {
		try {
			await removeVolumeForEnvironment(auth.userId, name, environmentId);
		} catch (error) {
			throw normalizeInUseDeleteError("volume", name, error);
		}
	}
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.remove.bulk",
		details: { volumeNames: Array.from(new Set(names)) },
	});
	revalidatePath("/dashboard/volumes");
}

export async function pruneVolumesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneVolumesForEnvironment(auth.userId, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.prune",
	});
	revalidatePath("/dashboard/volumes");
}

export async function backupVolumeAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const volumeName = getValue(formData, "volumeName");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!volumeName) {
		throw new Error("Volume name is required.");
	}

	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const { randomUUID } = await import("node:crypto");
	const backupId = randomUUID();
	const createdAt = new Date();

	const { db: dbClient, volumeBackups } = await import("@dockroot/db");
	await dbClient.insert(volumeBackups).values({
		id: backupId,
		environmentId: environment.id,
		volumeName,
		fileName: `${backupId}.tar.gz`,
		status: "in_progress",
		createdByUserId: auth.userId,
		createdAt,
	});

	try {
		const { backupVolumeForEnvironment } = await import("@/lib/environment-runtime");
		const result = await backupVolumeForEnvironment(
			auth.userId,
			volumeName,
			backupId,
			environmentId,
		);
		if (!result.ok) {
			const { eq } = await import("drizzle-orm");
			await dbClient
				.update(volumeBackups)
				.set({
					status: "failed",
					error: result.output || "Backup failed.",
					completedAt: new Date(),
				})
				.where(eq(volumeBackups.id, backupId));
			throw new Error(`Backup failed: ${result.output}`);
		}

		const sizeBytes = result.sizeBytes;
		const { eq } = await import("drizzle-orm");
		await dbClient
			.update(volumeBackups)
			.set({ status: "completed", sizeBytes: sizeBytes ?? undefined, completedAt: new Date() })
			.where(eq(volumeBackups.id, backupId));
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			environmentId: environment.id,
			userId: auth.userId,
			actionType: "volume.backup.create",
			details: {
				volumeName,
				backupId,
				fileName: result.fileName,
				sizeBytes: sizeBytes ?? null,
			},
		});
	} catch (error) {
		const { eq } = await import("drizzle-orm");
		await dbClient
			.update(volumeBackups)
			.set({
				status: "failed",
				error: error instanceof Error ? error.message : "Backup failed.",
				completedAt: new Date(),
			})
			.where(eq(volumeBackups.id, backupId));
		throw error;
	}

	revalidatePath("/dashboard/volumes");
}

export async function restoreVolumeAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const backupId = getValue(formData, "backupId");
	const volumeName = getValue(formData, "volumeName");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!backupId || !volumeName) {
		throw new Error("Backup ID and volume name are required.");
	}

	const { restoreVolumeForEnvironment } = await import("@/lib/environment-runtime");
	const result = await restoreVolumeForEnvironment(
		auth.userId,
		volumeName,
		backupId,
		environmentId,
	);
	if (!result.ok) {
		throw new Error(`Restore failed: ${result.output}`);
	}
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.backup.restore",
		details: { volumeName, backupId },
	});

	revalidatePath("/dashboard/volumes");
}

export async function deleteVolumeBackupAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const backupId = getValue(formData, "backupId");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!backupId) {
		throw new Error("Backup ID is required.");
	}

	const { deleteVolumeBackupForEnvironment } = await import("@/lib/environment-runtime");
	await deleteVolumeBackupForEnvironment(auth.userId, backupId, environmentId);

	const { db: dbClient, volumeBackups } = await import("@dockroot/db");
	const { eq } = await import("drizzle-orm");
	await dbClient.delete(volumeBackups).where(eq(volumeBackups.id, backupId));
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.backup.delete",
		details: { backupId },
	});

	revalidatePath("/dashboard/volumes");
}

export async function listVolumeBackupsAction(volumeName: string, environmentId?: string) {
	const auth = await requireUserSession();
	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const { listVolumeBackupsForUser } = await import("@/lib/volume-backups");
	const grouped = await listVolumeBackupsForUser({
		userId: auth.userId,
		environmentId: environment.id,
		volumeNames: [volumeName],
	});

	return grouped[volumeName] || [];
}
