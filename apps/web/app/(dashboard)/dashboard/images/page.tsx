import { PageHeader } from "@/components/page-header";
import { listRuntimeResources } from "@/lib/platform";

export default async function ImagesPage() {
	const runtime = await listRuntimeResources();

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Images"
				description="Current image inventory on the manager host."
			/>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{runtime.images.length ? (
					runtime.images.map((image) => (
						<div
							key={`${image.ID}-${image.Repository}`}
							className="rounded-[24px] border border-default/15 bg-surface/80 p-5"
						>
							<p className="text-sm font-semibold">{image.Repository}</p>
							<p className="mt-1 text-sm text-muted">{image.Tag}</p>
							<div className="mt-4 flex items-center justify-between text-xs text-muted">
								<span>{image.Size}</span>
								<span>{image.CreatedSince}</span>
							</div>
						</div>
					))
				) : (
					<div className="rounded-[24px] border border-dashed border-default/20 bg-surface/80 p-6 text-sm text-muted">
						No images found or Docker is unavailable.
					</div>
				)}
			</div>
		</div>
	);
}
