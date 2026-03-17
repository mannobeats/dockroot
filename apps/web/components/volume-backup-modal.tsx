"use client";

import { Archive, Clock3, HardDriveDownload, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import type { VolumeBackupRecord } from "@/lib/volume-backups";

type FormAction = (formData: FormData) => void | Promise<void>;

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

function summarizeBackups(backups: VolumeBackupRecord[]) {
	const completed = backups.filter((backup) => backup.status === "completed").length;
	const failed = backups.filter((backup) => backup.status === "failed").length;
	const inProgress = backups.filter((backup) => backup.status === "in_progress").length;
	return { completed, failed, inProgress };
}

export function VolumeBackupModal({
	volumeName,
	environmentId,
	backups,
	backupAction,
	restoreAction,
	deleteAction,
	triggerClassName,
	triggerLabel,
}: {
	volumeName: string;
	environmentId: string;
	backups: VolumeBackupRecord[];
	backupAction: FormAction;
	restoreAction: FormAction;
	deleteAction: FormAction;
	triggerClassName?: string;
	triggerLabel?: string;
}) {
	const [open, setOpen] = useState(false);
	const latestCompleted = backups.find((backup) => backup.status === "completed");
	const summary = summarizeBackups(backups);

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size={triggerLabel ? "sm" : "icon-xs"}
				onClick={() => setOpen(true)}
				className={cn("relative text-muted hover:text-foreground", triggerClassName)}
				title={
					backups.length
						? `Manage ${backups.length} backup${backups.length === 1 ? "" : "s"}`
						: "Create backup"
				}
			>
				<Archive className="h-3.5 w-3.5" />
				{triggerLabel ? <span>{triggerLabel}</span> : null}
				{backups.length ? (
					<span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold leading-4 text-accent-foreground">
						{backups.length}
					</span>
				) : null}
			</Button>

			{open ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
					<button
						type="button"
						aria-label="Close backup modal"
						onClick={() => setOpen(false)}
						className="absolute inset-0 h-full w-full cursor-default"
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-label={`Backups for ${volumeName}`}
						className="relative z-10 w-full max-w-3xl rounded-xl border border-default/12 bg-surface shadow-[var(--shadow-lg)]"
					>
						<div className="flex flex-wrap items-start justify-between gap-3 border-b border-default/8 px-4 py-4">
							<div className="space-y-1">
								<div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted">
									<HardDriveDownload className="h-3.5 w-3.5" />
									Volume Backups
								</div>
								<div>
									<p className="text-sm font-semibold">{volumeName}</p>
									<p className="text-xs text-muted">
										Snapshot this Docker volume, then restore or remove previous archives here.
									</p>
								</div>
							</div>

							<form action={backupAction} className="shrink-0">
								<input type="hidden" name="volumeName" value={volumeName} />
								<input type="hidden" name="environmentId" value={environmentId} />
								<FormSubmitButton
									label="Create backup"
									pendingLabel="Creating backup..."
									variant="primary"
									size="sm"
								/>
							</form>
						</div>

						<div className="space-y-4 p-4">
							<div className="grid gap-3 md:grid-cols-3">
								<Panel className="border-default/10 bg-background/50 p-3">
									<p className="text-[11px] uppercase tracking-wide text-muted">
										Latest successful
									</p>
									<p className="mt-1 text-sm font-semibold">
										{latestCompleted
											? formatDate(latestCompleted.createdAt)
											: "No completed backups"}
									</p>
									<p className="mt-1 text-[11px] text-muted">
										{latestCompleted
											? `${formatBytes(latestCompleted.sizeBytes)} archive`
											: "Create the first snapshot to enable restore."}
									</p>
								</Panel>

								<Panel className="border-default/10 bg-background/50 p-3">
									<p className="text-[11px] uppercase tracking-wide text-muted">Coverage</p>
									<p className="mt-1 text-sm font-semibold">
										{summary.completed} completed
										{summary.inProgress ? ` · ${summary.inProgress} running` : ""}
									</p>
									<p className="mt-1 text-[11px] text-muted">
										{summary.failed
											? `${summary.failed} backup${summary.failed === 1 ? "" : "s"} need attention.`
											: "Backup history is healthy."}
									</p>
								</Panel>

								<Panel className="border-default/10 bg-background/50 p-3">
									<div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
										<ShieldCheck className="h-3.5 w-3.5 text-success" />
										Restore guidance
									</div>
									<p className="mt-1 text-sm font-semibold">Stop attached containers first</p>
									<p className="mt-1 text-[11px] text-muted">
										Restoring replaces current volume contents with the selected archive.
									</p>
								</Panel>
							</div>

							{backups.length ? (
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
														{statusBadge(backup.status)}
														<span className="text-[11px] text-muted">
															{formatDate(backup.createdAt)}
														</span>
														<span className="inline-flex items-center gap-1 text-[11px] text-muted">
															<Clock3 className="h-3 w-3" />
															{formatBytes(backup.sizeBytes)}
														</span>
													</div>
													<p className="truncate text-xs font-medium text-foreground">
														{backup.fileName}
													</p>
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
							) : (
								<Panel className="border-dashed border-default/12 bg-background/35 p-6 text-center">
									<p className="text-sm font-medium">No backups yet</p>
									<p className="mt-1 text-xs text-muted">
										Create the first snapshot to protect this volume before making risky changes.
									</p>
								</Panel>
							)}
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
