import { Lock } from "lucide-react";
import Link from "next/link";
import { pruneImagesAction, pullImageAction, removeImageAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { listContainers, listImages } from "@/lib/platform/docker";
import { getProtectedImageRefs } from "@/lib/runtime-protection";

export default async function ImagesPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; image?: string }>;
}) {
	await requirePrivilegedPageSession();
	const params = await searchParams;
	const query = (params.q || "").toLowerCase();
	const images = await listImages();
	const filtered = images.filter((image) =>
		!query
			? true
			: `${image.Repository}:${image.Tag}`.toLowerCase().includes(query) ||
				(image.ID || "").toLowerCase().includes(query),
	);
	const containers = await listContainers();
	const protectedImageRefs = getProtectedImageRefs(containers);
	const taggedCount = filtered.filter((image) => image.Tag && image.Tag !== "<none>").length;
	const inUseCount = filtered.filter((image) =>
		containers.some((container) => container.Image === `${image.Repository}:${image.Tag}`),
	).length;

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

			<section className="grid gap-4 lg:grid-cols-3">
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Visible images</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{filtered.length}</p>
					<p className="mt-2 text-sm text-muted">Repository entries available on this engine.</p>
				</div>
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Tagged builds</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{taggedCount}</p>
					<p className="mt-2 text-sm text-muted">Images ready to inspect and reuse.</p>
				</div>
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">In active use</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{inUseCount}</p>
					<p className="mt-2 text-sm text-muted">
						Containers currently referencing these image tags.
					</p>
				</div>
			</section>

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
									const isProtected = protectedImageRefs.has(imageRef);
									return (
										<tr key={`${image.ID}-${imageRef}`}>
											<td className="px-4 py-3 font-medium">
												<div className="flex items-center gap-2">
													<Link
														href={`/dashboard/images/${encodeURIComponent(imageRef)}`}
														className="transition-colors hover:text-accent"
													>
														{image.Repository}
													</Link>
													{isProtected ? (
														<span
															title="Dockroot protected images cannot be deleted from the runtime dashboard."
															className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning"
														>
															<Lock className="h-3 w-3" />
															Locked
														</span>
													) : null}
												</div>
											</td>
											<td className="px-4 py-3 text-muted">{image.Tag}</td>
											<td className="px-4 py-3 text-muted">{image.Size}</td>
											<td className="px-4 py-3 text-muted">{image.CreatedSince}</td>
											<td className="px-4 py-3">
												<div className="flex flex-wrap gap-2">
													<Link
														href={`/dashboard/images/${encodeURIComponent(imageRef)}`}
														className="inline-flex h-8 items-center justify-center rounded-lg border border-default/20 bg-background px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
													>
														Details
													</Link>
													<form action={removeImageAction}>
														<input type="hidden" name="imageRef" value={imageRef} />
														<FormSubmitButton
															label="Delete"
															pendingLabel="Deleting..."
															disabled={isProtected}
															title={
																isProtected
																	? "Dockroot protected images cannot be deleted from the runtime dashboard."
																	: undefined
															}
															className="inline-flex h-8 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-medium text-danger"
														/>
													</form>
												</div>
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
		</div>
	);
}
