import Link from "next/link";
import {
	createVolumeAction,
	pruneVolumesAction,
	removeVolumeAction,
} from "@/app/(dashboard)/actions";
import { CreateVolumeModal } from "@/components/create-volume-modal";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
import { MetricCard } from "@/components/ui/metric-card";
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
	const localCount = filtered.filter(
		(volume: Record<string, string>) => volume.Driver === "local",
	).length;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Volumes"
				description={`${environment.name} — ${filtered.length} volumes`}
				actions={
					<div className="flex items-center gap-2">
						<DestructiveActionModal
							action={pruneVolumesAction}
							title="Prune unused volumes"
							description="This removes all dangling Docker volumes and may delete persisted data."
							triggerLabel="Prune"
							confirmLabel="Prune volumes"
							pendingLabel="Pruning..."
							triggerVariant="outline"
							triggerSize="sm"
							hiddenFields={{ environmentId: environment.id }}
						/>
						<CreateVolumeModal action={createVolumeAction} environmentId={environment.id} />
					</div>
				}
			/>

			{/* Search */}
			<Panel padding="md">
				<form className="flex gap-3">
					<Input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search volumes..."
						className="flex-1"
					/>
					<Button type="submit" variant="secondary">
						Filter
					</Button>
				</form>
			</Panel>

			{/* Stats */}
			<div className="grid gap-4 sm:grid-cols-3">
				<MetricCard label="Total" value={filtered.length} />
				<MetricCard label="Local driver" value={localCount} />
				<MetricCard label="Custom drivers" value={filtered.length - localCount} />
			</div>

			{/* Table */}
			<Panel>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Driver</DataTableHead>
							<DataTableHead>Mount point</DataTableHead>
							<DataTableHead>Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{filtered.length ? (
							filtered.map((volume: Record<string, string>) => (
								<DataTableRow key={`${volume.Name}-${volume.Driver}`}>
									<DataTableCell>
										<Link
											href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}?environment=${environment.id}`}
											className="font-medium transition-colors hover:text-foreground/80"
										>
											{volume.Name}
										</Link>
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">{volume.Driver}</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{volume.Mountpoint || "Docker managed"}
									</DataTableCell>
									<DataTableCell>
										<div className="flex gap-1.5">
											<LinkButton
												href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}?environment=${environment.id}`}
												variant="outline"
												size="xs"
											>
												Details
											</LinkButton>
											<DestructiveActionModal
												action={removeVolumeAction}
												title={`Delete volume ${volume.Name}`}
												description="This permanently removes the volume and all data it contains."
												triggerLabel="Delete"
												confirmLabel="Delete volume"
												pendingLabel="Deleting..."
												triggerVariant="danger"
												triggerSize="xs"
												hiddenFields={{ name: volume.Name, environmentId: environment.id }}
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
