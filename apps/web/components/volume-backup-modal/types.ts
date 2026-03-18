import type { VolumeBackupRecord } from "@/lib/volume-backups";

export type FormAction = (formData: FormData) => void | Promise<void>;

export interface VolumeBackupModalProps {
	volumeName: string;
	environmentId: string;
	backups: VolumeBackupRecord[];
	backupAction: FormAction;
	restoreAction: FormAction;
	deleteAction: FormAction;
	triggerClassName?: string;
	triggerLabel?: string;
}

export interface BackupSummary {
	completed: number;
	failed: number;
	inProgress: number;
}
