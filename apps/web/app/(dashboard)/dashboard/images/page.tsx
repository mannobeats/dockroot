import { Lock } from "lucide-react";
import Link from "next/link";
import { pruneImagesAction, pullImageAction, removeImageAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
	const taggedCount = filtered.filter(
		(image: Record<string, string>) => image.Tag && image.Tag !== "<none>",
	).length;
	const inUseCount = filtered.filter((image: Record<string, string>) =>
		containerImageRefs.has(`${image.Repository}:${image.Tag}`),
	).length;
	const danglingCount = filtered.filter(
		(image: Record<string, string>) => image.Repository === "<none>" || image.Tag === "<none>",
	).length;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Images"
				description={`${environment.name} — ${filtered.length} images`}
			/>

			{/* Actions bar */}
			<Panel padding="sm">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-end">
					<form className="flex flex-1 gap-3">
						<Input
							type="search"
							name="q"
							defaultValue={params.q || ""}
							placeholder="Search images..."
							className="flex-1"
						/>
						<Button type="submit" variant="secondary">
							Filter
						</Button>
					</form>
					<form action={pullImageAction} className="flex gap-3">
						<input type="hidden" name="environmentId" value={environment.id} />
						<Input type="text" name="imageRef" required placeholder="ghcr.io/owner/image:tag" />
						<FormSubmitButton label="Pull" pendingLabel="Pulling..." />
					</form>
					<div className="flex gap-2">
						<form action={pruneImagesAction}>
							<input type="hidden" name="environmentId" value={environment.id} />
							<FormSubmitButton
								label="Prune dangling"
								pendingLabel="Pruning..."
								variant="outline"
							/>
						</form>
						<form action={pruneImagesAction}>
							<input type="hidden" name="environmentId" value={environment.id} />
							<input type="hidden" name="mode" value="all" />
							<FormSubmitButton label="Prune unused" pendingLabel="Pruning..." variant="warning" />
						</form>
					</div>
				</div>
			</Panel>

			{/* Stats */}
			<div className="grid gap-4 sm:grid-cols-3">
				<MetricCard label="Total images" value={filtered.length} />
				<MetricCard label="Tagged" value={taggedCount} description={`${danglingCount} dangling`} />
				<MetricCard
					label="In use"
					value={inUseCount}
					description={`${Math.max(filtered.length - inUseCount, 0)} unused`}
					valueClassName="text-success"
				/>
			</div>

			{/* Table */}
			<Panel>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Image</DataTableHead>
							<DataTableHead>Tag</DataTableHead>
							<DataTableHead>Size</DataTableHead>
							<DataTableHead>Updated</DataTableHead>
							<DataTableHead>Actions</DataTableHead>
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
											<div className="flex items-center gap-2">
												<Link
													href={`/dashboard/images/${encodeURIComponent(imageRef)}?environment=${environment.id}`}
													className="font-medium transition-colors hover:text-foreground/80"
												>
													{image.Repository}
												</Link>
												{isProtected ? (
													<Badge variant="warning">
														<Lock className="h-2.5 w-2.5" />
														Locked
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
										<DataTableCell className="text-xs text-muted">
											{image.CreatedSince}
										</DataTableCell>
										<DataTableCell>
											<div className="flex gap-1.5">
												<LinkButton
													href={`/dashboard/images/${encodeURIComponent(imageRef)}?environment=${environment.id}`}
													variant="outline"
													size="xs"
												>
													Details
												</LinkButton>
												<form action={removeImageAction}>
													<input type="hidden" name="imageRef" value={imageRef} />
													<input type="hidden" name="environmentId" value={environment.id} />
													<FormSubmitButton
														label="Delete"
														pendingLabel="Deleting..."
														disabled={isProtected}
														variant="danger"
														size="xs"
													/>
												</form>
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
