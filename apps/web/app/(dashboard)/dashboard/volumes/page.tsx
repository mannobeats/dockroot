import {
	backupVolumeAction,
	bulkRemoveVolumesAction,
	createVolumeAction,
	deleteVolumeBackupAction,
	pruneVolumesAction,
	removeVolumeAction,
	restoreVolumeAction,
} from "@/app/(dashboard)/actions";
import { CreateVolumeModal } from "@/components/create-volume-modal";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { PageHeader } from "@/components/page-header";
import { RuntimeUnavailablePanel } from "@/components/runtime-unavailable-panel";
import { VolumesPageWorkspace } from "@/components/volumes-page-workspace";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import {
	getRuntimeConnectionMessage,
	isRuntimeConnectionError,
	listVolumesForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { listVolumeBackupsForUser } from "@/lib/volume-backups";

export default async function VolumesPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; volume?: string; environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(session.userId, params.environment);
	let runtimeIssue: string | null = null;
	const { volumes } = await listVolumesForEnvironment(session.userId, environment.id).catch(
		(error) => {
			if (isRuntimeConnectionError(error)) {
				runtimeIssue = getRuntimeConnectionMessage(error);
				return { environment, volumes: [] };
			}
			throw error;
		},
	);
	const backupsByVolume = await listVolumeBackupsForUser({
		userId: session.userId,
		environmentId: environment.id,
		volumeNames: volumes.map((volume: Record<string, string>) => volume.Name).filter(Boolean),
	});

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Volumes"
				description={`${environment.name} · ${volumes.length} volumes`}
				actions={
					<div className="flex items-center gap-1.5">
						<DestructiveActionModal
							action={pruneVolumesAction}
							title="Prune unused volumes"
							description="This removes all dangling Docker volumes and may delete persisted data."
							triggerLabel="Prune"
							confirmLabel="Prune"
							pendingLabel="Pruning..."
							triggerVariant="outline"
							triggerSize="xs"
							hiddenFields={{ environmentId: environment.id }}
						/>
						<CreateVolumeModal action={createVolumeAction} environmentId={environment.id} />
					</div>
				}
			/>

			{runtimeIssue ? (
				<RuntimeUnavailablePanel title="Volumes unavailable" message={runtimeIssue} />
			) : null}

			<VolumesPageWorkspace
				volumes={volumes as Array<Record<string, string>>}
				environmentId={environment.id}
				removeVolumeAction={removeVolumeAction}
				bulkRemoveVolumesAction={bulkRemoveVolumesAction}
				backupVolumeAction={backupVolumeAction}
				restoreVolumeAction={restoreVolumeAction}
				deleteVolumeBackupAction={deleteVolumeBackupAction}
				backupsByVolume={backupsByVolume}
				initialQuery={params.q || ""}
			/>
		</div>
	);
}
