import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import {
	getVolumeDetailsForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";

export default async function VolumeDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ volumeName: string }>;
	searchParams: Promise<{ environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const { volumeName } = await params;
	const query = await searchParams;
	const decodedName = decodeURIComponent(volumeName);
	const environment = await resolveRuntimeEnvironment(session.userId, query.environment);
	const { volume } = await getVolumeDetailsForEnvironment(
		session.userId,
		decodedName,
		environment.id,
	);

	if (!volume) {
		return <div className="text-sm text-muted">Volume not found.</div>;
	}

	return (
		<div className="animate-in space-y-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Link
					href={`/dashboard/volumes?environment=${environment.id}`}
					className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-default/10 text-muted transition-colors hover:text-foreground"
				>
					<ArrowLeft className="h-4 w-4" />
				</Link>
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">Volume</p>
					<h1 className="text-lg font-semibold">{decodedName}</h1>
				</div>
			</div>

			{/* Info grid */}
			<div className="grid gap-3 sm:grid-cols-3">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Driver</p>
					<p className="mt-1 text-sm font-medium">{String(volume.Driver || "local")}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Mount point</p>
					<p className="mt-1 break-all text-sm font-medium">
						{String(volume.Mountpoint || "Managed by Docker")}
					</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Scope</p>
					<p className="mt-1 text-sm font-medium">{String(volume.Scope || "local")}</p>
				</div>
			</div>

			{/* Inspect payload */}
			<div className="rounded-xl border border-default/10 bg-surface">
				<div className="border-b border-default/10 px-4 py-3">
					<h2 className="text-sm font-semibold">Inspect payload</h2>
				</div>
				<pre className="log-viewport max-h-[600px] p-4 text-xs leading-6 text-muted">
					{JSON.stringify(volume, null, 2)}
				</pre>
			</div>
		</div>
	);
}
