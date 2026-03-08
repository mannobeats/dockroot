import { Lock } from "lucide-react";
import Link from "next/link";
import { pruneImagesAction, pullImageAction, removeImageAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
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
	const taggedCount = filtered.filter(
		(image: Record<string, string>) => image.Tag && image.Tag !== "<none>",
	).length;
	const inUseCount = filtered.filter((image: Record<string, string>) =>
		containers.some(
			(container: Record<string, string>) => container.Image === `${image.Repository}:${image.Tag}`,
		),
	).length;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Images"
				description={`${environment.name} — ${filtered.length} images`}
			/>

			{/* Actions bar */}
			<div className="rounded-xl border border-default/10 bg-surface p-4">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-end">
					<form className="flex flex-1 gap-3">
						<input
							type="search"
							name="q"
							defaultValue={params.q || ""}
							placeholder="Search images..."
							className="h-9 flex-1 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
						<button
							type="submit"
							className="inline-flex h-9 items-center rounded-lg border border-default/10 px-3 text-sm font-medium"
						>
							Filter
						</button>
					</form>
					<form action={pullImageAction} className="flex gap-3">
						<input type="hidden" name="environmentId" value={environment.id} />
						<input
							type="text"
							name="imageRef"
							required
							placeholder="ghcr.io/owner/image:tag"
							className="h-9 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
						<FormSubmitButton
							label="Pull"
							pendingLabel="Pulling..."
							className="inline-flex h-9 items-center rounded-lg bg-foreground px-3 text-sm font-medium text-background"
						/>
					</form>
					<div className="flex gap-2">
						<form action={pruneImagesAction}>
							<input type="hidden" name="environmentId" value={environment.id} />
							<FormSubmitButton
								label="Prune dangling"
								pendingLabel="Pruning..."
								className="inline-flex h-9 items-center rounded-lg border border-default/10 px-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
							/>
						</form>
						<form action={pruneImagesAction}>
							<input type="hidden" name="environmentId" value={environment.id} />
							<input type="hidden" name="mode" value="all" />
							<FormSubmitButton
								label="Prune unused"
								pendingLabel="Pruning..."
								className="inline-flex h-9 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
							/>
						</form>
					</div>
				</div>
			</div>

			{/* Stats */}
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Total images</p>
					<p className="mt-1 text-2xl font-semibold">{filtered.length}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Tagged</p>
					<p className="mt-1 text-2xl font-semibold">{taggedCount}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">In use</p>
					<p className="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{inUseCount}</p>
				</div>
			</div>

			{/* Table */}
			<div className="rounded-xl border border-default/10 bg-surface">
				<div className="table-scroll">
					<table className="min-w-full text-left text-sm">
						<thead>
							<tr className="border-b border-default/10 text-xs text-muted">
								<th className="px-4 py-3 font-medium">Image</th>
								<th className="px-4 py-3 font-medium">Tag</th>
								<th className="px-4 py-3 font-medium">Size</th>
								<th className="px-4 py-3 font-medium">Updated</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/5">
							{filtered.length ? (
								filtered.map((image: Record<string, string>) => {
									const imageRef = `${image.Repository}:${image.Tag}`;
									const isProtected = protectedImageRefs.has(imageRef);
									return (
										<tr key={`${image.ID}-${imageRef}`} className="transition-colors hover:bg-foreground/[0.02]">
											<td className="px-4 py-3">
												<div className="flex items-center gap-2">
													<Link
														href={`/dashboard/images/${encodeURIComponent(imageRef)}?environment=${environment.id}`}
														className="font-medium transition-colors hover:text-foreground/80"
													>
														{image.Repository}
													</Link>
													{isProtected ? (
														<span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
															<Lock className="h-2.5 w-2.5" />
															Locked
														</span>
													) : null}
												</div>
											</td>
											<td className="px-4 py-3 text-xs text-muted">{image.Tag}</td>
											<td className="px-4 py-3 text-xs text-muted">{image.Size}</td>
											<td className="px-4 py-3 text-xs text-muted">{image.CreatedSince}</td>
											<td className="px-4 py-3">
												<div className="flex gap-1.5">
													<Link
														href={`/dashboard/images/${encodeURIComponent(imageRef)}?environment=${environment.id}`}
														className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
													>
														Details
													</Link>
													<form action={removeImageAction}>
														<input type="hidden" name="imageRef" value={imageRef} />
														<input type="hidden" name="environmentId" value={environment.id} />
														<FormSubmitButton
															label="Delete"
															pendingLabel="Deleting..."
															disabled={isProtected}
															className="inline-flex h-7 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
														/>
													</form>
												</div>
											</td>
										</tr>
									);
								})
							) : (
								<tr>
									<td colSpan={5} className="px-4 py-12 text-center text-sm text-muted">
										No images found.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
