"use client";

import { Archive, HardDriveDownload } from "lucide-react";
import { useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { VolumeBackupHistoryList } from "./history-list";
import { VolumeBackupSummaryCards } from "./summary-cards";
import type { VolumeBackupModalProps } from "./types";
import { summarizeBackups } from "./utils";

export function VolumeBackupModal({
	volumeName,
	environmentId,
	backups,
	backupAction,
	restoreAction,
	deleteAction,
	triggerClassName,
	triggerLabel,
}: VolumeBackupModalProps) {
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
							<VolumeBackupSummaryCards latestCompleted={latestCompleted} summary={summary} />
							<VolumeBackupHistoryList
								backups={backups}
								volumeName={volumeName}
								environmentId={environmentId}
								restoreAction={restoreAction}
								deleteAction={deleteAction}
							/>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
