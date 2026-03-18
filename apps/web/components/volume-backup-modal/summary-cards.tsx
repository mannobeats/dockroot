import { ShieldCheck } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import type { VolumeBackupRecord } from "@/lib/volume-backups";
import type { BackupSummary } from "./types";
import { formatBytes, formatDate } from "./utils";

interface VolumeBackupSummaryCardsProps {
	latestCompleted?: VolumeBackupRecord;
	summary: BackupSummary;
}

export function VolumeBackupSummaryCards({
	latestCompleted,
	summary,
}: VolumeBackupSummaryCardsProps) {
	return (
		<div className="grid gap-3 md:grid-cols-3">
			<Panel className="border-default/10 bg-background/50 p-3">
				<p className="text-[11px] uppercase tracking-wide text-muted">Latest successful</p>
				<p className="mt-1 text-sm font-semibold">
					{latestCompleted ? formatDate(latestCompleted.createdAt) : "No completed backups"}
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
	);
}
