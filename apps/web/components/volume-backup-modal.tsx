"use client";

import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { ActionModal } from "@/components/action-modal";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";

type FormAction = (formData: FormData) => void | Promise<void>;

type VolumeBackup = {
	id: string;
	volumeName: string;
	fileName: string;
	sizeBytes: number | null;
	status: "in_progress" | "completed" | "failed";
	error: string | null;
	createdAt: Date;
	completedAt: Date | null;
};

function formatBytes(bytes: number | null) {
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

function formatDate(date: Date | string | null) {
	if (!date) {
		return "—";
	}
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function statusBadge(status: string) {
	switch (status) {
		case "completed":
			return (
				<span className="inline-flex items-center rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
					Completed
				</span>
			);
		case "failed":
			return (
				<span className="inline-flex items-center rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
					Failed
				</span>
			);
		default:
			return (
				<span className="inline-flex items-center rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning animate-pulse">
					In progress
				</span>
			);
	}
}

export function VolumeBackupModal({
	volumeName,
	environmentId,
	backups,
	backupAction,
	restoreAction,
	deleteAction,
}: {
	volumeName: string;
	environmentId: string;
	backups: VolumeBackup[];
	backupAction: FormAction;
	restoreAction: FormAction;
	deleteAction: FormAction;
}) {
	const [open, setOpen] = useState(false);

	return (
		<ActionModal
			trigger=""
			triggerIcon={Archive}
			triggerVariant="ghost"
			triggerSize="xs"
			title={`Backups — ${volumeName}`}
			description="Create and manage volume backups."
			icon={Archive}
			open={open}
			onOpenChange={setOpen}
		>
			<div className="space-y-4">
				{/* Create backup */}
				<form action={backupAction}>
					<input type="hidden" name="volumeName" value={volumeName} />
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label="Create backup"
						pendingLabel="Creating backup..."
						variant="primary"
						size="sm"
					/>
				</form>

				{/* Backup list */}
				{backups.length ? (
					<div className="max-h-64 space-y-2 overflow-y-auto">
						{backups.map((backup) => (
							<div
								key={backup.id}
								className="flex items-center justify-between rounded-lg border border-default/8 px-3 py-2"
							>
								<div className="min-w-0 flex-1 space-y-0.5">
									<div className="flex items-center gap-2">
										{statusBadge(backup.status)}
										<span className="text-[11px] text-muted">{formatDate(backup.createdAt)}</span>
									</div>
									<p className="truncate text-[11px] text-muted">
										{formatBytes(backup.sizeBytes)}
										{backup.error ? <span className="ml-1 text-danger">{backup.error}</span> : null}
									</p>
								</div>
								{backup.status === "completed" ? (
									<div className="flex items-center gap-0.5">
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
				) : (
					<p className="py-4 text-center text-xs text-muted">
						No backups yet. Create one to get started.
					</p>
				)}
			</div>
		</ActionModal>
	);
}
