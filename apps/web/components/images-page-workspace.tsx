"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ImagesTableWorkspace } from "@/components/images-table-workspace";
import { InstantFilterToolbar } from "@/components/instant-filter-toolbar";
import { Panel } from "@/components/ui/panel";
import { matchesSearchQuery } from "@/lib/search";

type FormAction = (formData: FormData) => void | Promise<void>;
type ImageRow = Record<string, string>;

export function ImagesPageWorkspace({
	images,
	environmentId,
	removeImageAction,
	bulkRemoveImagesAction,
	protectedImageRefs,
	inUseImageRefs,
	initialQuery = "",
}: {
	images: ImageRow[];
	environmentId: string;
	removeImageAction: FormAction;
	bulkRemoveImagesAction: FormAction;
	protectedImageRefs: string[];
	inUseImageRefs: string[];
	initialQuery?: string;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [usageFilter, setUsageFilter] = useState("all");
	const deferredQuery = useDeferredValue(query);
	const protectedSet = useMemo(() => new Set(protectedImageRefs), [protectedImageRefs]);
	const inUseSet = useMemo(() => new Set(inUseImageRefs), [inUseImageRefs]);

	const filteredImages = useMemo(
		() =>
			images.filter((image) => {
				const imageRef = `${image.Repository}:${image.Tag}`;
				const isInUse = inUseSet.has(imageRef);
				const isProtected = protectedSet.has(imageRef);
				const isDangling = image.Repository === "<none>" || image.Tag === "<none>";
				const matchesUsage =
					usageFilter === "all" ||
					(usageFilter === "in-use" && isInUse) ||
					(usageFilter === "unused" && !isInUse) ||
					(usageFilter === "dangling" && isDangling) ||
					(usageFilter === "protected" && isProtected);

				return (
					matchesUsage &&
					matchesSearchQuery(
						deferredQuery,
						image.Repository,
						image.Tag,
						image.ID,
						image.Size,
						image.CreatedSince,
						imageRef,
					)
				);
			}),
		[deferredQuery, images, inUseSet, protectedSet, usageFilter],
	);

	return (
		<Panel>
			<InstantFilterToolbar
				searchId="image-list-search"
				searchPlaceholder="Search images by repository, tag, id, or size"
				query={query}
				onQueryChange={setQuery}
				resultCount={filteredImages.length}
				totalCount={images.length}
				onReset={() => {
					setQuery("");
					setUsageFilter("all");
				}}
				filters={[
					{
						id: "image-usage-filter",
						value: usageFilter,
						onChange: setUsageFilter,
						className: "h-7 min-w-36 text-xs",
						options: [
							{ value: "all", label: "All images" },
							{ value: "in-use", label: "In use" },
							{ value: "unused", label: "Unused" },
							{ value: "dangling", label: "Dangling" },
							{ value: "protected", label: "Protected" },
						],
					},
				]}
			/>
			{inUseImageRefs.length ? (
				<p className="border-b border-default/8 px-3 py-2 text-xs text-muted">
					{inUseImageRefs.length} image(s) are currently in use by containers and cannot be deleted.
				</p>
			) : null}
			<ImagesTableWorkspace
				images={filteredImages}
				environmentId={environmentId}
				removeImageAction={removeImageAction}
				bulkRemoveImagesAction={bulkRemoveImagesAction}
				protectedImageRefs={protectedImageRefs}
				inUseImageRefs={inUseImageRefs}
			/>
		</Panel>
	);
}
