import { pruneImagesAction, pullImageAction, removeImageAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getImageDetails, listImages } from "@/lib/platform/docker";

export default async function ImagesPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; image?: string }>;
}) {
	const params = await searchParams;
	const query = (params.q || "").toLowerCase();
	const images = await listImages();
	const filtered = images.filter((image) =>
		!query
			? true
			: `${image.Repository}:${image.Tag}`.toLowerCase().includes(query) ||
				(image.ID || "").toLowerCase().includes(query),
	);
	const selectedImageRef =
		params.image || (filtered[0] ? `${filtered[0].Repository}:${filtered[0].Tag}` : "");
	const selectedImage = selectedImageRef ? await getImageDetails(selectedImageRef) : null;

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Images"
				description="Pull, inspect, delete, and prune images on the local Docker engine."
			/>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="grid gap-3 xl:grid-cols-[1fr_auto_auto]">
					<form className="grid gap-3 md:grid-cols-[1fr_auto]">
						<input
							type="search"
							name="q"
							defaultValue={params.q || ""}
							placeholder="Search images"
							className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						/>
						<button
							type="submit"
							className="inline-flex h-11 items-center justify-center rounded-xl border border-default/15 bg-background px-4 text-sm font-medium"
						>
							Filter
						</button>
					</form>
					<form action={pullImageAction} className="grid gap-3 md:grid-cols-[1fr_auto]">
						<input
							type="text"
							name="imageRef"
							required
							placeholder="ghcr.io/owner/image:tag"
							className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						/>
						<FormSubmitButton label="Pull image" pendingLabel="Pulling..." />
					</form>
					<div className="flex flex-wrap gap-2">
						<form action={pruneImagesAction}>
							<FormSubmitButton label="Prune dangling" pendingLabel="Pruning..." />
						</form>
						<form action={pruneImagesAction}>
							<input type="hidden" name="mode" value="all" />
							<FormSubmitButton
								label="Prune unused"
								pendingLabel="Pruning..."
								className="inline-flex h-11 items-center justify-center rounded-xl border border-warning/30 bg-warning/10 px-4 text-sm font-medium text-warning"
							/>
						</form>
					</div>
				</div>
			</section>

			<div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="overflow-hidden rounded-xl border border-default/15">
						<table className="min-w-full divide-y divide-default/15 text-left">
							<thead className="bg-background/60 text-[11px] uppercase tracking-[0.18em] text-muted">
								<tr>
									<th className="px-4 py-3 font-medium">Image</th>
									<th className="px-4 py-3 font-medium">Tag</th>
									<th className="px-4 py-3 font-medium">Size</th>
									<th className="px-4 py-3 font-medium">Updated</th>
									<th className="px-4 py-3 font-medium">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-default/10 bg-surface/40 text-sm">
								{filtered.length ? (
									filtered.map((image) => {
										const imageRef = `${image.Repository}:${image.Tag}`;
										const active = imageRef === selectedImageRef;
										return (
											<tr key={`${image.ID}-${imageRef}`} className={active ? "bg-accent/5" : ""}>
												<td className="px-4 py-3 font-medium">
													<a
														href={`/dashboard/images?image=${encodeURIComponent(imageRef)}`}
														className="transition-colors hover:text-accent"
													>
														{image.Repository}
													</a>
												</td>
												<td className="px-4 py-3 text-muted">{image.Tag}</td>
												<td className="px-4 py-3 text-muted">{image.Size}</td>
												<td className="px-4 py-3 text-muted">{image.CreatedSince}</td>
												<td className="px-4 py-3">
													<form action={removeImageAction}>
														<input type="hidden" name="imageRef" value={imageRef} />
														<FormSubmitButton
															label="Delete"
															pendingLabel="Deleting..."
															className="inline-flex h-8 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-medium text-danger"
														/>
													</form>
												</td>
											</tr>
										);
									})
								) : (
									<tr>
										<td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
											No images matched the current filters.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</section>

				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold tracking-tight">Image inspection</h2>
						{selectedImage ? <StatusBadge status="healthy" /> : null}
					</div>
					{selectedImage ? (
						<div className="mt-4 space-y-4">
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="rounded-xl border border-default/15 bg-background/60 p-4">
									<p className="text-xs text-muted">Architecture</p>
									<p className="mt-2 text-sm font-medium">
										{String(selectedImage.Architecture || "unknown")}
									</p>
								</div>
								<div className="rounded-xl border border-default/15 bg-background/60 p-4">
									<p className="text-xs text-muted">OS</p>
									<p className="mt-2 text-sm font-medium">
										{String(selectedImage.Os || "unknown")}
									</p>
								</div>
							</div>
							<pre className="max-h-[560px] overflow-auto rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/85">
								{JSON.stringify(selectedImage, null, 2)}
							</pre>
						</div>
					) : (
						<div className="mt-4 rounded-xl border border-dashed border-default/20 bg-background/60 p-6 text-sm text-muted">
							Select an image to inspect it.
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
