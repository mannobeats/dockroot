"use server";

import { revalidatePath } from "next/cache";
import { normalizeInUseDeleteError } from "@/app/(dashboard)/actions/utils/errors";
import {
	getValue,
	getValues,
	requireDestructiveConfirmation,
} from "@/app/(dashboard)/actions/utils/form-data";
import { recordVolumeAuditEvent } from "@/app/(dashboard)/actions/utils/volume-audit";
import {
	createVolumeBackupRecord,
	markVolumeBackupCompleted,
	markVolumeBackupFailed,
	removeVolumeBackupRecord,
} from "@/app/(dashboard)/actions/utils/volume-backups";
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
	await recordVolumeAuditEvent({
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
		await recordVolumeAuditEvent({
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

	const uniqueNames = Array.from(new Set(names));
	for (const name of uniqueNames) {
		try {
			await removeVolumeForEnvironment(auth.userId, name, environmentId);
		} catch (error) {
			throw normalizeInUseDeleteError("volume", name, error);
		}
	}
	await recordVolumeAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "volume.remove.bulk",
		details: { volumeNames: uniqueNames },
	});
	revalidatePath("/dashboard/volumes");
}

export async function pruneVolumesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneVolumesForEnvironment(auth.userId, environmentId);
	await recordVolumeAuditEvent({
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
	const backupId = crypto.randomUUID();

	await createVolumeBackupRecord({
		backupId,
		environmentId: environment.id,
		volumeName,
		userId: auth.userId,
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
			await markVolumeBackupFailed({
				backupId,
				errorMessage: result.output || "Backup failed.",
			});
			throw new Error(`Backup failed: ${result.output}`);
		}

		await markVolumeBackupCompleted({
			backupId,
			sizeBytes: result.sizeBytes ?? null,
		});
		await recordVolumeAuditEvent({
			environmentId: environment.id,
			userId: auth.userId,
			actionType: "volume.backup.create",
			details: {
				volumeName,
				backupId,
				fileName: result.fileName,
				sizeBytes: result.sizeBytes ?? null,
			},
		});
	} catch (error) {
		await markVolumeBackupFailed({
			backupId,
			errorMessage: error instanceof Error ? error.message : "Backup failed.",
		});
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
	await recordVolumeAuditEvent({
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
	await removeVolumeBackupRecord(backupId);
	await recordVolumeAuditEvent({
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
