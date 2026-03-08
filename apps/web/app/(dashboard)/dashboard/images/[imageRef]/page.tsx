import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getImageDetails, listContainers } from "@/lib/platform/docker";

export default async function ImageDetailPage({
	params,
}: {
	params: Promise<{ imageRef: string }>;
}) {
	const { imageRef } = await params;
	const decodedRef = decodeURIComponent(imageRef);
	const [image, containers] = await Promise.all([getImageDetails(decodedRef), listContainers()]);

	if (!image) {
		return <div className="text-sm text-muted">Image not found.</div>;
	}

	const attachedContainers = containers.filter(
		(container) =>
			`${container.Image}` === decodedRef ||
			`${container.Image}:${container.Tag || ""}` === decodedRef,
	);

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title={decodedRef}
				description="Image metadata, layer information, and runtime usage."
				actions={
					<Link
						href="/dashboard/images"
						className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Link>
				}
			/>

			<div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold tracking-tight">Overview</h2>
						<StatusBadge status="healthy" />
					</div>
					<div className="mt-5 grid gap-3 sm:grid-cols-2">
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Architecture</p>
							<p className="mt-2 text-sm font-medium">{String(image.Architecture || "unknown")}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">OS</p>
							<p className="mt-2 text-sm font-medium">{String(image.Os || "unknown")}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Size</p>
							<p className="mt-2 text-sm font-medium">{String(image.Size || "unknown")}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Containers using image</p>
							<p className="mt-2 text-sm font-medium">{attachedContainers.length}</p>
						</div>
					</div>
					<div className="mt-5 rounded-xl border border-default/15 bg-background/60 p-4">
						<p className="text-sm font-semibold">Runtime usage</p>
						<div className="mt-3 space-y-2 text-sm text-muted">
							{attachedContainers.length ? (
								attachedContainers.map((container) => (
									<Link
										key={container.ID}
										href={`/dashboard/containers/${container.ID}`}
										className="block rounded-lg bg-surface px-3 py-2 transition-colors hover:text-foreground"
									>
										<p className="font-medium">{container.Names}</p>
										<p className="mt-1 text-xs">{container.Status}</p>
									</Link>
								))
							) : (
								<p>No containers currently reference this image.</p>
							)}
						</div>
					</div>
				</section>

				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<h2 className="text-lg font-semibold tracking-tight">Inspect payload</h2>
					<pre className="mt-4 max-h-[720px] overflow-auto rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/85">
						{JSON.stringify(image, null, 2)}
					</pre>
				</section>
			</div>
		</div>
	);
}
