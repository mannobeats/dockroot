"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { InstantFilterToolbar } from "@/components/instant-filter-toolbar";
import { Panel } from "@/components/ui/panel";
import { VolumesTableWorkspace } from "@/components/volumes-table-workspace";
import { matchesSearchQuery } from "@/lib/search";
import type { VolumeBackupRecord } from "@/lib/volume-backups";

type FormAction = (formData: FormData) => void | Promise<void>;
type VolumeRow = Record<string, string>;

export function VolumesPageWorkspace({
	volumes,
	environmentId,
	removeVolumeAction,
	bulkRemoveVolumesAction,
	backupVolumeAction,
	restoreVolumeAction,
	deleteVolumeBackupAction,
	backupsByVolume,
	initialQuery = "",
}: {
	volumes: VolumeRow[];
	environmentId: string;
	removeVolumeAction: FormAction;
	bulkRemoveVolumesAction: FormAction;
	backupVolumeAction?: FormAction;
	restoreVolumeAction?: FormAction;
	deleteVolumeBackupAction?: FormAction;
	backupsByVolume?: Record<string, VolumeBackupRecord[]>;
	initialQuery?: string;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [backupFilter, setBackupFilter] = useState("all");
	const deferredQuery = useDeferredValue(query);

	const filteredVolumes = useMemo(
		() =>
			volumes.filter((volume) => {
				const hasBackups = Boolean(backupsByVolume?.[volume.Name]?.length);
				const matchesBackupFilter =
					backupFilter === "all" ||
					(backupFilter === "with-backups" && hasBackups) ||
					(backupFilter === "no-backups" && !hasBackups);

				return (
					matchesBackupFilter &&
					matchesSearchQuery(
						deferredQuery,
						volume.Name,
						volume.Driver,
						volume.Mountpoint,
						backupsByVolume?.[volume.Name]?.map((backup) => backup.fileName),
					)
				);
			}),
		[backupFilter, backupsByVolume, deferredQuery, volumes],
	);

	return (
		<Panel>
			<InstantFilterToolbar
				searchId="volume-list-search"
				searchPlaceholder="Search volumes by name, driver, mount path, or backup file"
				query={query}
				onQueryChange={setQuery}
				resultCount={filteredVolumes.length}
				totalCount={volumes.length}
				onReset={() => {
					setQuery("");
					setBackupFilter("all");
				}}
				filters={[
					{
						id: "volume-backup-filter",
						value: backupFilter,
						onChange: setBackupFilter,
						className: "h-9 min-w-40 text-xs",
						options: [
							{ value: "all", label: "All volumes" },
							{ value: "with-backups", label: "With backups" },
							{ value: "no-backups", label: "No backups" },
						],
					},
				]}
			/>
			<VolumesTableWorkspace
				volumes={filteredVolumes}
				environmentId={environmentId}
				removeVolumeAction={removeVolumeAction}
				bulkRemoveVolumesAction={bulkRemoveVolumesAction}
				backupVolumeAction={backupVolumeAction}
				restoreVolumeAction={restoreVolumeAction}
				deleteVolumeBackupAction={deleteVolumeBackupAction}
				backupsByVolume={backupsByVolume}
			/>
		</Panel>
	);
}
