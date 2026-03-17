import { ArrowLeft } from "lucide-react";
import {
	backupVolumeAction,
	deleteVolumeBackupAction,
	restoreVolumeAction,
} from "@/app/(dashboard)/actions";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { VolumeBackupModal } from "@/components/volume-backup-modal";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import {
	getVolumeDetailsForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { listVolumeBackupsForUser } from "@/lib/volume-backups";

export default async function VolumeDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ volumeName: string }>;
	searchParams: Promise<{ environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const { volumeName } = await params;
	const query = await searchParams;
	const decodedName = decodeURIComponent(volumeName);
	const environment = await resolveRuntimeEnvironment(session.userId, query.environment);
	const { volume } = await getVolumeDetailsForEnvironment(
		session.userId,
		decodedName,
		environment.id,
	);
	const backupsByVolume = await listVolumeBackupsForUser({
		userId: session.userId,
		environmentId: environment.id,
		volumeNames: [decodedName],
	});
	const backups = backupsByVolume[decodedName] || [];
	const latestCompletedBackup = backups.find((backup) => backup.status === "completed");
	const backupState = backups.some((backup) => backup.status === "failed")
		? "Needs attention"
		: backups.some((backup) => backup.status === "in_progress")
			? "In progress"
			: backups.length
				? "Healthy"
				: "Not configured";

	if (!volume) {
		return <div className="text-sm text-muted">Volume not found.</div>;
	}

	return (
		<div className="animate-in space-y-5">
			<div className="flex items-center gap-2.5">
				<LinkButton
					href={`/dashboard/volumes?environment=${environment.id}`}
					variant="ghost"
					size="icon-sm"
				>
					<ArrowLeft className="h-4 w-4" />
				</LinkButton>
				<div>
					<h1 className="text-lg font-semibold">{decodedName}</h1>
					<p className="text-xs text-muted">{environment.name}</p>
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-3">
				<MetricCard
					label="Driver"
					value={String(volume.Driver || "local")}
					valueClassName="text-sm"
				/>
				<MetricCard
					label="Mount point"
					value={String(volume.Mountpoint || "Managed by Docker")}
					valueClassName="break-all text-sm"
				/>
				<MetricCard
					label="Scope"
					value={String(volume.Scope || "local")}
					valueClassName="text-sm"
				/>
			</div>

			<Panel>
				<PanelHeader>
					<div>
						<PanelTitle>Backup History</PanelTitle>
						<p className="mt-0.5 text-xs text-muted">
							Create snapshots for this volume, then restore or clean them up later.
						</p>
					</div>
					<VolumeBackupModal
						volumeName={decodedName}
						environmentId={environment.id}
						backups={backups}
						backupAction={backupVolumeAction}
						restoreAction={restoreVolumeAction}
						deleteAction={deleteVolumeBackupAction}
						triggerLabel="Manage backups"
						triggerClassName="rounded-lg border border-default/12 bg-surface text-foreground hover:bg-foreground/[0.04]"
					/>
				</PanelHeader>
				<div className="grid gap-3 p-4 sm:grid-cols-3">
					<MetricCard
						label="Snapshots"
						value={backups.length}
						description={backups.length ? "Stored for this volume" : "No backup history yet"}
					/>
					<MetricCard
						label="Latest backup"
						value={
							latestCompletedBackup ? latestCompletedBackup.createdAt.toLocaleString() : "None yet"
						}
						valueClassName="text-sm font-semibold"
						description="Most recent completed archive"
					/>
					<MetricCard
						label="Backup state"
						value={backupState}
						valueClassName="text-sm font-semibold"
						description="Based on the latest backup records"
					/>
				</div>
			</Panel>

			<Panel>
				<PanelHeader>
					<PanelTitle>Inspect payload</PanelTitle>
				</PanelHeader>
				<LogBlock className="max-h-[600px] rounded-none border-0 p-3 text-muted">
					{JSON.stringify(volume, null, 2)}
				</LogBlock>
			</Panel>
		</div>
	);
}
