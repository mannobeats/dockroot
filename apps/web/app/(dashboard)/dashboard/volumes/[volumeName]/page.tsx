import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { getVolumeDetails } from "@/lib/platform/docker";

export default async function VolumeDetailPage({
	params,
}: {
	params: Promise<{ volumeName: string }>;
}) {
	await requirePrivilegedPageSession();
	const { volumeName } = await params;
	const decodedName = decodeURIComponent(volumeName);
	const volume = await getVolumeDetails(decodedName);

	if (!volume) {
		return <div className="text-sm text-muted">Volume not found.</div>;
	}

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title={decodedName}
				description="Inspect volume mount data and low-level Docker metadata."
				actions={
					<Link
						href="/dashboard/volumes"
						className="inline-flex h-11 items-center justify-center rounded-xl border border-default/20 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back
					</Link>
				}
			/>

			<div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Driver</p>
							<p className="mt-2 text-sm font-medium">{String(volume.Driver || "local")}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Mount point</p>
							<p className="mt-2 break-all text-sm font-medium">
								{String(volume.Mountpoint || "Managed by Docker")}
							</p>
						</div>
					</div>
					<div className="mt-5 rounded-xl border border-default/15 bg-background/60 p-4">
						<p className="text-xs text-muted">Scope</p>
						<p className="mt-2 text-sm font-medium">{String(volume.Scope || "local")}</p>
					</div>
				</section>

				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<h2 className="text-lg font-semibold tracking-tight">Inspect payload</h2>
					<pre className="mt-4 max-h-[720px] overflow-auto rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/85">
						{JSON.stringify(volume, null, 2)}
					</pre>
				</section>
			</div>
		</div>
	);
}
