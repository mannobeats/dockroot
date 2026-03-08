import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
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
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title={decodedName}
				description={`Inspect network topology, attached containers, and docker metadata on ${environment.name}.`}
				actions={
					<Link
						href={`/dashboard/networks?environment=${environment.id}`}
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
							<p className="mt-2 text-sm font-medium">{String(network.Driver || "unknown")}</p>
						</div>
						<div className="rounded-xl border border-default/15 bg-background/60 p-4">
							<p className="text-xs text-muted">Scope</p>
							<p className="mt-2 text-sm font-medium">{String(network.Scope || "local")}</p>
						</div>
					</div>
					<div className="mt-5 rounded-xl border border-default/15 bg-background/60 p-4">
						<p className="text-sm font-semibold">Attached containers</p>
						<div className="mt-3 space-y-2 text-sm text-muted">
							{containers.length ? (
								containers.map(([containerId, container]) => (
									<Link
										key={containerId}
										href={`/dashboard/containers/${containerId}?environment=${environment.id}`}
										className="block rounded-lg bg-surface px-3 py-2 transition-colors hover:text-foreground"
									>
										<p className="font-medium">{container.Name || containerId}</p>
										<p className="mt-1 text-xs">{containerId}</p>
									</Link>
								))
							) : (
								<p>No containers are attached to this network.</p>
							)}
						</div>
					</div>
				</section>

				<section className="rounded-2xl border border-default/15 bg-surface p-5">
					<h2 className="text-lg font-semibold tracking-tight">Inspect payload</h2>
					<pre className="log-viewport mt-4 max-h-[720px] rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/85">
						{JSON.stringify(network, null, 2)}
					</pre>
				</section>
			</div>
		</div>
	);
}
