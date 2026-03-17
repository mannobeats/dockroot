import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { RuntimeUnavailablePanel } from "@/components/runtime-unavailable-panel";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import {
	getNetworkDetailsForEnvironment,
	getRuntimeConnectionMessage,
	isRuntimeConnectionError,
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
	let runtimeIssue: string | null = null;
	const { network } = await getNetworkDetailsForEnvironment(
		session.userId,
		decodedName,
		environment.id,
	).catch((error) => {
		if (isRuntimeConnectionError(error)) {
			runtimeIssue = getRuntimeConnectionMessage(error);
			return { environment, network: null };
		}
		throw error;
	});

	if (runtimeIssue) {
		return (
			<div className="animate-in space-y-5">
				<RuntimeUnavailablePanel title="Network details unavailable" message={runtimeIssue} />
			</div>
		);
	}

	if (!network) {
		return <div className="text-sm text-muted">Network not found.</div>;
	}

	const containers = Object.entries(
		(network.Containers as Record<string, { Name?: string }>) || {},
	);

	return (
		<div className="animate-in space-y-5">
			<div className="flex items-center gap-2.5">
				<LinkButton
					href={`/dashboard/networks?environment=${environment.id}`}
					variant="ghost"
					size="icon-sm"
				>
					<ArrowLeft className="h-4 w-4" />
				</LinkButton>
				<div>
					<h1 className="text-lg font-semibold">{decodedName}</h1>
					<p className="text-xs text-muted">{environment.name}</p>
				</div>
			</div>

			<div className="grid gap-3 sm:grid-cols-3">
				<MetricCard
					label="Driver"
					value={String(network.Driver || "unknown")}
					valueClassName="text-sm"
				/>
				<MetricCard
					label="Scope"
					value={String(network.Scope || "local")}
					valueClassName="text-sm"
				/>
				<MetricCard label="Containers" value={containers.length} valueClassName="text-sm" />
			</div>

			{containers.length ? (
				<Panel>
					<PanelHeader>
						<PanelTitle>Attached containers</PanelTitle>
					</PanelHeader>
					<div className="divide-y divide-default/5">
						{containers.map(([containerId, container]) => (
							<Link
								key={containerId}
								href={`/dashboard/containers/${containerId}?environment=${environment.id}`}
								className="flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-foreground/[0.02]"
							>
								<div>
									<p className="text-sm font-medium">{container.Name || containerId}</p>
									<p className="font-mono text-[11px] text-muted">{containerId.slice(0, 12)}</p>
								</div>
							</Link>
						))}
					</div>
				</Panel>
			) : null}

			<Panel>
				<PanelHeader>
					<PanelTitle>Inspect payload</PanelTitle>
				</PanelHeader>
				<LogBlock className="max-h-[600px] rounded-none border-0 p-3 text-muted">
					{JSON.stringify(network, null, 2)}
				</LogBlock>
			</Panel>
		</div>
	);
}
