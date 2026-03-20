"use client";

import { ExternalLink, Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
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
import { LinkButton } from "@/components/ui/link-button";

type FormAction = (formData: FormData) => void | Promise<void>;

type ImageRow = Record<string, string>;

export function ImagesTableWorkspace({
	images,
	environmentId,
	removeImageAction,
	bulkRemoveImagesAction,
	protectedImageRefs,
	inUseImageRefs,
}: {
	images: ImageRow[];
	environmentId: string;
	removeImageAction: FormAction;
	bulkRemoveImagesAction: FormAction;
	protectedImageRefs: string[];
	inUseImageRefs: string[];
}) {
	const [selectedRefs, setSelectedRefs] = useState<Record<string, boolean>>({});
	const protectedSet = useMemo(() => new Set(protectedImageRefs), [protectedImageRefs]);
	const inUseSet = useMemo(() => new Set(inUseImageRefs), [inUseImageRefs]);
	const selectableRefs = useMemo(
		() =>
			images
				.map((image) => `${image.Repository}:${image.Tag}`)
				.filter((imageRef) => !protectedSet.has(imageRef) && !inUseSet.has(imageRef)),
		[images, protectedSet, inUseSet],
	);
	const selected = useMemo(
		() =>
			images
				.map((image) => ({ image, imageRef: `${image.Repository}:${image.Tag}` }))
				.filter(({ imageRef }) => selectedRefs[imageRef]),
		[images, selectedRefs],
	);
	const allSelectableSelected =
		selectableRefs.length > 0 && selectableRefs.every((imageRef) => selectedRefs[imageRef]);

	return (
		<>
			<div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-default/8 px-3 py-2">
				<p className="mr-2 text-xs text-muted">
					{selected.length ? `${selected.length} selected` : "Select one or more images"}
				</p>
				<DestructiveActionModal
					action={bulkRemoveImagesAction}
					onConfirm={() => {
						setSelectedRefs({});
					}}
					title={`Remove ${selected.length} image(s)`}
					description="This permanently removes all selected images from local cache."
					triggerLabel="Remove"
					confirmLabel="Remove all"
					pendingLabel="Removing..."
					triggerVariant="danger"
					triggerSize="xs"
					disabled={!selected.length}
					hiddenFields={{ imageRefs: selected.map(({ imageRef }) => imageRef), environmentId }}
				/>
				<button
					type="button"
					onClick={() => setSelectedRefs({})}
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
								aria-label="Select all images"
								checked={allSelectableSelected}
								onChange={(event) => {
									if (!event.target.checked) {
										setSelectedRefs({});
										return;
									}
									setSelectedRefs((current) => ({
										...current,
										...Object.fromEntries(selectableRefs.map((ref) => [ref, true])),
									}));
								}}
								className="h-3.5 w-3.5 rounded border-default/30 bg-background"
							/>
						</DataTableHead>
						<DataTableHead>Image</DataTableHead>
						<DataTableHead>Tag</DataTableHead>
						<DataTableHead>Size</DataTableHead>
						<DataTableHead>Updated</DataTableHead>
						<DataTableHead className="w-16 text-right">Actions</DataTableHead>
					</tr>
				</DataTableHeader>
				<DataTableBody>
					{images.length ? (
						images.map((image) => {
							const imageRef = `${image.Repository}:${image.Tag}`;
							const isProtected = protectedSet.has(imageRef);
							const isInUse = inUseSet.has(imageRef);
							const isDangling = image.Repository === "<none>" || image.Tag === "<none>";
							const deleteBlocked = isProtected || isInUse;
							return (
								<DataTableRow key={`${image.ID}-${imageRef}`}>
									<DataTableCell>
										<input
											type="checkbox"
											aria-label={`Select ${imageRef}`}
											disabled={deleteBlocked}
											checked={Boolean(selectedRefs[imageRef])}
											onChange={(event) =>
												setSelectedRefs((current) => ({
													...current,
													[imageRef]: event.target.checked,
												}))
											}
											title={
												isProtected
													? "Protected images cannot be deleted."
													: isInUse
														? "Cannot delete image while it is used by a container."
														: ""
											}
											className="h-3.5 w-3.5 rounded border-default/30 bg-background"
										/>
									</DataTableCell>
									<DataTableCell>
										<div className="flex items-center gap-1.5">
											<Link
												href={`/dashboard/images/${encodeURIComponent(imageRef)}?environment=${environmentId}`}
												className="font-medium transition-colors hover:text-accent"
											>
												{image.Repository}
											</Link>
											{isProtected ? (
												<Badge variant="warning">
													<Lock className="h-2.5 w-2.5" />
												</Badge>
											) : null}
											<Badge variant={isInUse ? "success" : "default"}>
												{isInUse ? "In use" : "Unused"}
											</Badge>
											{isDangling ? <Badge variant="warning">Dangling</Badge> : null}
										</div>
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">{image.Tag}</DataTableCell>
									<DataTableCell className="text-xs text-muted">{image.Size}</DataTableCell>
									<DataTableCell className="text-xs text-muted">{image.CreatedSince}</DataTableCell>
									<DataTableCell>
										<div className="flex items-center justify-end gap-0.5">
											<LinkButton
												href={`/dashboard/images/${encodeURIComponent(imageRef)}?environment=${environmentId}`}
												variant="ghost"
												size="icon-xs"
												title="View"
											>
												<ExternalLink className="h-3.5 w-3.5" />
											</LinkButton>
											<DestructiveActionModal
												action={removeImageAction}
												title={`Remove image ${imageRef}`}
												description={
													isInUse
														? "Cannot delete this image because one or more containers are currently using it."
														: "This permanently removes the image from local cache."
												}
												triggerLabel=""
												confirmLabel="Remove"
												pendingLabel="Removing..."
												triggerVariant="ghost"
												triggerSize="xs"
												disabled={deleteBlocked}
												hiddenFields={{ imageRef, environmentId }}
												triggerClassName="h-6 w-6 p-0 text-muted hover:text-danger"
												triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
												triggerTitle="Remove"
											/>
										</div>
									</DataTableCell>
								</DataTableRow>
							);
						})
					) : (
						<DataTableEmpty colSpan={6}>No images found.</DataTableEmpty>
					)}
				</DataTableBody>
			</DataTable>
		</>
	);
}
