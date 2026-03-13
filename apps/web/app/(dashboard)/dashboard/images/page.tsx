import { ExternalLink, Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { pruneImagesAction, pullImageAction, removeImageAction } from "@/app/(dashboard)/actions";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { PageHeader } from "@/components/page-header";
import { PullImageModal } from "@/components/pull-image-modal";
import { Badge } from "@/components/ui/badge";
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
import {
	listContainersForEnvironment,
	listImagesForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { getProtectedImageRefs } from "@/lib/runtime-protection";

export default async function ImagesPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; image?: string; environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(session.userId, params.environment);
	const query = (params.q || "").toLowerCase();
	const { images } = await listImagesForEnvironment(session.userId, environment.id);
	const filtered = images.filter((image: Record<string, string>) =>
		!query
			? true
			: `${image.Repository}:${image.Tag}`.toLowerCase().includes(query) ||
				(image.ID || "").toLowerCase().includes(query),
	);
	const { containers } = await listContainersForEnvironment(session.userId, environment.id);
	const protectedImageRefs =
		environment.kind === "local" ? getProtectedImageRefs(containers) : new Set<string>();
	const containerImageRefs = new Set(
		containers.map((container: Record<string, string>) => container.Image).filter(Boolean),
	);
	const inUseCount = filtered.filter((image: Record<string, string>) =>
		containerImageRefs.has(`${image.Repository}:${image.Tag}`),
	).length;
	const danglingCount = filtered.filter(
		(image: Record<string, string>) => image.Repository === "<none>" || image.Tag === "<none>",
	).length;

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Images"
				description={`${environment.name} · ${filtered.length} images · ${inUseCount} in use · ${danglingCount} dangling`}
				actions={
					<div className="flex items-center gap-1.5">
						<DestructiveActionModal
							action={pruneImagesAction}
							title="Prune dangling images"
							description="This removes dangling images that are no longer referenced."
							triggerLabel="Prune dangling"
							confirmLabel="Prune"
							pendingLabel="Pruning..."
							triggerVariant="outline"
							triggerSize="xs"
							hiddenFields={{ environmentId: environment.id }}
						/>
						<DestructiveActionModal
							action={pruneImagesAction}
							title="Prune unused images"
							description="This removes all unused local images and can impact redeploy speed."
							triggerLabel="Prune unused"
							confirmLabel="Prune"
							pendingLabel="Pruning..."
							triggerVariant="warning"
							triggerSize="xs"
							hiddenFields={{ environmentId: environment.id, mode: "all" }}
						/>
						<PullImageModal action={pullImageAction} environmentId={environment.id} />
					</div>
				}
			/>

			<Panel>
				<form className="border-b border-default/8 px-3 py-2">
					<Input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search images..."
						className="border-0 bg-transparent shadow-none focus:ring-0"
					/>
				</form>

				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Image</DataTableHead>
							<DataTableHead>Tag</DataTableHead>
							<DataTableHead>Size</DataTableHead>
							<DataTableHead>Updated</DataTableHead>
							<DataTableHead className="w-16 text-right">Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{filtered.length ? (
							filtered.map((image: Record<string, string>) => {
								const imageRef = `${image.Repository}:${image.Tag}`;
								const isProtected = protectedImageRefs.has(imageRef);
								const isInUse = containerImageRefs.has(imageRef);
								const isDangling = image.Repository === "<none>" || image.Tag === "<none>";
								return (
									<DataTableRow key={`${image.ID}-${imageRef}`}>
										<DataTableCell>
											<div className="flex items-center gap-1.5">
												<Link
													href={`/dashboard/images/${encodeURIComponent(imageRef)}?environment=${environment.id}`}
													className="font-medium transition-colors hover:text-accent"
												>
													{image.Repository}
												</Link>
												{isProtected ? (
													<Badge variant="warning"><Lock className="h-2.5 w-2.5" /></Badge>
												) : null}
												<Badge variant={isInUse ? "success" : "default"}>
													{isInUse ? "In use" : "Unused"}
												</Badge>
												{isDangling ? <Badge variant="warning">Dangling</Badge> : null}
											</div>
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">{image.Tag}</DataTableCell>
										<DataTableCell className="text-xs text-muted">{image.Size}</DataTableCell>
										<DataTableCell className="text-xs text-muted">
											{image.CreatedSince}
										</DataTableCell>
										<DataTableCell>
											<div className="flex items-center justify-end gap-0.5">
												<LinkButton
													href={`/dashboard/images/${encodeURIComponent(imageRef)}?environment=${environment.id}`}
													variant="ghost"
													size="icon-xs"
													title="Details"
												>
													<ExternalLink className="h-3.5 w-3.5" />
												</LinkButton>
												<DestructiveActionModal
													action={removeImageAction}
													title={`Delete image ${imageRef}`}
													description="This permanently removes the image from local cache."
													triggerLabel=""
													confirmLabel="Delete"
													pendingLabel="Deleting..."
													triggerVariant="ghost"
													triggerSize="xs"
													disabled={isProtected}
													hiddenFields={{ imageRef, environmentId: environment.id }}
													triggerClassName="h-6 w-6 p-0 text-muted hover:text-danger"
													triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
												/>
											</div>
										</DataTableCell>
									</DataTableRow>
								);
							})
						) : (
							<DataTableEmpty colSpan={5}>No images found.</DataTableEmpty>
						)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
