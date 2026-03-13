"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/link-button";

type FormAction = (formData: FormData) => void | Promise<void>;

type VolumeRow = Record<string, string>;

export function VolumesTableWorkspace({
	volumes,
	environmentId,
	removeVolumeAction,
	bulkRemoveVolumesAction,
}: {
	volumes: VolumeRow[];
	environmentId: string;
	removeVolumeAction: FormAction;
	bulkRemoveVolumesAction: FormAction;
}) {
	const [selectedNames, setSelectedNames] = useState<Record<string, boolean>>({});
	const allNames = useMemo(() => volumes.map((volume) => volume.Name), [volumes]);
	const selected = useMemo(
		() => volumes.filter((volume) => selectedNames[volume.Name]),
		[volumes, selectedNames],
	);
	const allSelected = allNames.length > 0 && allNames.every((name) => selectedNames[name]);

	return (
		<>
			<div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-default/8 px-3 py-2">
				<p className="mr-2 text-xs text-muted">
					{selected.length ? `${selected.length} selected` : "Select one or more volumes"}
				</p>
				<DestructiveActionModal
					action={bulkRemoveVolumesAction}
					title={`Delete ${selected.length} volume(s)`}
					description="This permanently removes all selected volumes and their data."
					triggerLabel={`Delete${selected.length ? ` (${selected.length})` : ""}`}
					confirmLabel="Delete all"
					pendingLabel="Deleting..."
					triggerVariant="danger"
					triggerSize="xs"
					disabled={!selected.length}
					hiddenFields={{ names: selected.map((volume) => volume.Name), environmentId }}
				/>
				<button
					type="button"
					onClick={() => setSelectedNames({})}
					disabled={!selected.length}
					className="ml-auto text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
				>
					Clear
				</button>
			</div>

			<DataTable>
				<DataTableHeader>
					<tr>
						<DataTableHead className="w-8">
							<input
								type="checkbox"
								aria-label="Select all volumes"
								checked={allSelected}
								onChange={(event) => {
									if (!event.target.checked) {
										setSelectedNames({});
										return;
									}
									setSelectedNames((current) => ({
										...current,
										...Object.fromEntries(allNames.map((name) => [name, true])),
									}));
								}}
								className="h-3.5 w-3.5 rounded border-default/30 bg-background"
							/>
						</DataTableHead>
						<DataTableHead>Name</DataTableHead>
						<DataTableHead>Driver</DataTableHead>
						<DataTableHead>Mount point</DataTableHead>
						<DataTableHead className="w-16 text-right">Actions</DataTableHead>
					</tr>
				</DataTableHeader>
				<DataTableBody>
					{volumes.length ? (
						volumes.map((volume) => (
							<DataTableRow key={`${volume.Name}-${volume.Driver}`}>
								<DataTableCell>
									<input
										type="checkbox"
										aria-label={`Select ${volume.Name}`}
										checked={Boolean(selectedNames[volume.Name])}
										onChange={(event) =>
											setSelectedNames((current) => ({ ...current, [volume.Name]: event.target.checked }))
										}
										className="h-3.5 w-3.5 rounded border-default/30 bg-background"
									/>
								</DataTableCell>
								<DataTableCell>
									<Link
										href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}?environment=${environmentId}`}
										className="font-medium transition-colors hover:text-accent"
									>
										{volume.Name}
									</Link>
								</DataTableCell>
								<DataTableCell className="text-xs text-muted">{volume.Driver}</DataTableCell>
								<DataTableCell className="max-w-[240px] truncate text-xs text-muted">
									{volume.Mountpoint || "Docker managed"}
								</DataTableCell>
								<DataTableCell>
									<div className="flex items-center justify-end gap-0.5">
										<LinkButton
											href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}?environment=${environmentId}`}
											variant="ghost"
											size="icon-xs"
											title="Details"
										>
											<ExternalLink className="h-3.5 w-3.5" />
										</LinkButton>
										<DestructiveActionModal
											action={removeVolumeAction}
											title={`Delete volume ${volume.Name}`}
											description="This permanently removes the volume and all data it contains."
											triggerLabel=""
											confirmLabel="Delete"
											pendingLabel="Deleting..."
											triggerVariant="ghost"
											triggerSize="xs"
											hiddenFields={{ name: volume.Name, environmentId }}
											triggerClassName="h-6 w-6 p-0 text-muted hover:text-danger"
											triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
										/>
									</div>
								</DataTableCell>
							</DataTableRow>
						))
					) : (
						<DataTableEmpty colSpan={5}>No volumes found.</DataTableEmpty>
					)}
				</DataTableBody>
			</DataTable>
		</>
	);
}
