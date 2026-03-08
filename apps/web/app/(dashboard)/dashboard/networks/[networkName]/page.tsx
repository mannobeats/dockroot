import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import {
	getNetworkDetailsForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";

export default async function NetworkDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ networkName: string }>;
	searchParams: Promise<{ environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const { networkName } = await params;
	const query = await searchParams;
	const decodedName = decodeURIComponent(networkName);
	const environment = await resolveRuntimeEnvironment(session.userId, query.environment);
	const { network } = await getNetworkDetailsForEnvironment(
		session.userId,
		decodedName,
		environment.id,
	);

	if (!network) {
		return <div className="text-sm text-muted">Network not found.</div>;
	}

	const containers = Object.entries(
		(network.Containers as Record<string, { Name?: string }>) || {},
	);

	return (
		<div className="animate-in space-y-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Link
					href={`/dashboard/networks?environment=${environment.id}`}
					className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-default/10 text-muted transition-colors hover:text-foreground"
				>
					<ArrowLeft className="h-4 w-4" />
				</Link>
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">Network</p>
					<h1 className="text-lg font-semibold">{decodedName}</h1>
				</div>
			</div>

			{/* Info */}
			<div className="grid gap-3 sm:grid-cols-3">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Driver</p>
					<p className="mt-1 text-sm font-medium">{String(network.Driver || "unknown")}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Scope</p>
					<p className="mt-1 text-sm font-medium">{String(network.Scope || "local")}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Containers</p>
					<p className="mt-1 text-sm font-medium">{containers.length}</p>
				</div>
			</div>

			{/* Attached containers */}
			{containers.length ? (
				<div className="rounded-xl border border-default/10 bg-surface">
					<div className="border-b border-default/10 px-4 py-3">
						<h2 className="text-sm font-semibold">Attached containers</h2>
					</div>
					<div className="divide-y divide-default/5">
						{containers.map(([containerId, container]) => (
							<Link
								key={containerId}
								href={`/dashboard/containers/${containerId}?environment=${environment.id}`}
								className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-foreground/[0.02]"
							>
								<div>
									<p className="text-sm font-medium">{container.Name || containerId}</p>
									<p className="mt-0.5 font-mono text-xs text-muted">{containerId.slice(0, 12)}</p>
								</div>
							</Link>
						))}
					</div>
				</div>
			) : null}

			{/* Inspect payload */}
			<div className="rounded-xl border border-default/10 bg-surface">
				<div className="border-b border-default/10 px-4 py-3">
					<h2 className="text-sm font-semibold">Inspect payload</h2>
				</div>
				<pre className="log-viewport max-h-[600px] p-4 text-xs leading-6 text-muted">
					{JSON.stringify(network, null, 2)}
				</pre>
			</div>
		</div>
	);
}
