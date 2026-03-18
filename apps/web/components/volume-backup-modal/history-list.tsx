import { Clock3, RotateCcw, Trash2 } from "lucide-react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { Panel } from "@/components/ui/panel";
import type { VolumeBackupRecord } from "@/lib/volume-backups";
import { VolumeBackupStatusBadge } from "./status-badge";
import type { FormAction } from "./types";
import { formatBytes, formatDate } from "./utils";

interface VolumeBackupHistoryListProps {
	backups: VolumeBackupRecord[];
	volumeName: string;
	environmentId: string;
	restoreAction: FormAction;
	deleteAction: FormAction;
}

export function VolumeBackupHistoryList({
	backups,
	volumeName,
	environmentId,
	restoreAction,
	deleteAction,
}: VolumeBackupHistoryListProps) {
	if (!backups.length) {
		return (
			<Panel className="border-dashed border-default/12 bg-background/35 p-6 text-center">
				<p className="text-sm font-medium">No backups yet</p>
				<p className="mt-1 text-xs text-muted">
					Create the first snapshot to protect this volume before making risky changes.
				</p>
			</Panel>
		);
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<p className="text-xs font-medium text-foreground">Backup history</p>
				<p className="text-[11px] text-muted">
					{backups.length} snapshot{backups.length === 1 ? "" : "s"}
				</p>
			</div>

			<div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
				{backups.map((backup) => (
					<div
						key={backup.id}
						className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default/8 bg-background/40 px-3 py-3"
					>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<VolumeBackupStatusBadge status={backup.status} />
								<span className="text-[11px] text-muted">{formatDate(backup.createdAt)}</span>
								<span className="inline-flex items-center gap-1 text-[11px] text-muted">
									<Clock3 className="h-3 w-3" />
									{formatBytes(backup.sizeBytes)}
								</span>
							</div>
							<p className="truncate text-xs font-medium text-foreground">{backup.fileName}</p>
							<p className="text-[11px] text-muted">
								{backup.error
									? backup.error
									: backup.completedAt
										? `Completed ${formatDate(backup.completedAt)}`
										: "Archive is being generated now."}
							</p>
						</div>

						{backup.status === "completed" ? (
							<div className="flex items-center gap-1">
								<DestructiveActionModal
									action={restoreAction}
									title={`Restore volume ${volumeName}`}
									description="This will replace all current data in the volume with the backup contents. Containers using this volume should be stopped first."
									triggerLabel=""
									triggerIcon={<RotateCcw className="h-3.5 w-3.5" />}
									confirmLabel="Restore"
									pendingLabel="Restoring..."
									triggerVariant="ghost"
									triggerSize="xs"
									triggerClassName="h-6 w-6 p-0 text-muted hover:text-foreground"
									hiddenFields={{
										backupId: backup.id,
										volumeName,
										environmentId,
									}}
								/>
								<DestructiveActionModal
									action={deleteAction}
									title="Delete backup"
									description="This permanently removes this backup file."
									triggerLabel=""
									triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
									confirmLabel="Delete"
									pendingLabel="Deleting..."
									triggerVariant="ghost"
									triggerSize="xs"
									triggerClassName="h-6 w-6 p-0 text-muted hover:text-danger"
									hiddenFields={{
										backupId: backup.id,
										environmentId,
									}}
									requireAcknowledgement={false}
								/>
							</div>
						) : null}
					</div>
				))}
			</div>
		</div>
	);
}
