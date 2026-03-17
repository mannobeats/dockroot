import {
	backupVolumeAction,
	bulkRemoveVolumesAction,
	createVolumeAction,
	pruneVolumesAction,
	removeVolumeAction,
} from "@/app/(dashboard)/actions";
import { CreateVolumeModal } from "@/components/create-volume-modal";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { VolumesTableWorkspace } from "@/components/volumes-table-workspace";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { listVolumesForEnvironment, resolveRuntimeEnvironment } from "@/lib/environment-runtime";

export default async function VolumesPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; volume?: string; environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(session.userId, params.environment);
	const query = (params.q || "").toLowerCase();
	const { volumes } = await listVolumesForEnvironment(session.userId, environment.id);
	const filtered = volumes.filter((volume: Record<string, string>) =>
		!query
			? true
			: `${volume.Name} ${volume.Driver} ${volume.Mountpoint || ""}`.toLowerCase().includes(query),
	);

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Volumes"
				description={`${environment.name} · ${filtered.length} volumes`}
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

			<Panel>
				<form className="border-b border-default/8 px-3 py-2">
					<Input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search volumes..."
						className="w-full"
					/>
				</form>

				<VolumesTableWorkspace
					volumes={filtered as Array<Record<string, string>>}
					environmentId={environment.id}
					removeVolumeAction={removeVolumeAction}
					bulkRemoveVolumesAction={bulkRemoveVolumesAction}
					backupVolumeAction={backupVolumeAction}
				/>
			</Panel>
		</div>
	);
}
