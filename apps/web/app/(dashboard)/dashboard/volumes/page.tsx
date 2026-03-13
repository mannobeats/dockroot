import { ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import {
	createVolumeAction,
	pruneVolumesAction,
	removeVolumeAction,
} from "@/app/(dashboard)/actions";
import { CreateVolumeModal } from "@/components/create-volume-modal";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { PageHeader } from "@/components/page-header";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
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
						className="border-0 bg-transparent shadow-none focus:ring-0"
					/>
				</form>

				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Driver</DataTableHead>
							<DataTableHead>Mount point</DataTableHead>
							<DataTableHead className="w-16 text-right">Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{filtered.length ? (
							filtered.map((volume: Record<string, string>) => (
								<DataTableRow key={`${volume.Name}-${volume.Driver}`}>
									<DataTableCell>
										<Link
											href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}?environment=${environment.id}`}
											className="font-medium transition-colors hover:text-accent"
										>
											{volume.Name}
										</Link>
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">{volume.Driver}</DataTableCell>
									<DataTableCell className="text-xs text-muted max-w-[240px] truncate">
										{volume.Mountpoint || "Docker managed"}
									</DataTableCell>
									<DataTableCell>
										<div className="flex items-center justify-end gap-0.5">
											<LinkButton
												href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}?environment=${environment.id}`}
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
												hiddenFields={{ name: volume.Name, environmentId: environment.id }}
												triggerClassName="h-6 w-6 p-0 text-muted hover:text-danger"
												triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
											/>
										</div>
									</DataTableCell>
								</DataTableRow>
							))
						) : (
							<DataTableEmpty colSpan={4}>No volumes found.</DataTableEmpty>
						)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
