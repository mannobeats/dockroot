import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import {
	getImageDetailsForEnvironment,
	listContainersForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { isProtectedManagerImage } from "@/lib/runtime-protection";

export default async function ImageDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ imageRef: string }>;
	searchParams: Promise<{ environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const { imageRef } = await params;
	const query = await searchParams;
	const decodedRef = decodeURIComponent(imageRef);
	const environment = await resolveRuntimeEnvironment(session.userId, query.environment);
	const [{ image }, { containers }] = await Promise.all([
		getImageDetailsForEnvironment(session.userId, decodedRef, environment.id),
		listContainersForEnvironment(session.userId, environment.id),
	]);

	if (!image) {
		return <div className="text-sm text-muted">Image not found.</div>;
	}

	const attachedContainers = containers.filter(
		(container: Record<string, string>) =>
			`${container.Image}` === decodedRef ||
			`${container.Image}:${container.Tag || ""}` === decodedRef,
	);
	const isProtected =
		environment.kind === "local" && isProtectedManagerImage(decodedRef, containers);

	return (
		<div className="animate-in space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<LinkButton
						href={`/dashboard/images?environment=${environment.id}`}
						variant="outline"
						size="icon"
					>
						<ArrowLeft className="h-4 w-4" />
					</LinkButton>
					<div>
						<div className="flex items-center gap-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">
								Image
							</p>
							<StatusBadge status="healthy" />
							{isProtected ? (
								<Badge title="Dockroot protected image" variant="warning">
									<Lock className="h-2.5 w-2.5" />
									Locked
								</Badge>
							) : null}
						</div>
						<h1 className="text-lg font-semibold">{decodedRef}</h1>
					</div>
				</div>
			</div>

			{/* Info grid */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard label="Architecture" value={String(image.Architecture || "unknown")} valueClassName="text-sm" />
				<MetricCard label="OS" value={String(image.Os || "unknown")} valueClassName="text-sm" />
				<MetricCard label="Size" value={String(image.Size || "unknown")} valueClassName="text-sm" />
				<MetricCard label="Containers" value={attachedContainers.length} valueClassName="text-sm" />
			</div>

			{/* Runtime usage */}
			{attachedContainers.length ? (
				<Panel>
					<PanelHeader>
						<PanelTitle>Runtime usage</PanelTitle>
					</PanelHeader>
					<div className="divide-y divide-default/5">
						{attachedContainers.map((container: Record<string, string>) => (
							<Link
								key={container.ID}
								href={`/dashboard/containers/${container.ID}?environment=${environment.id}`}
								className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-foreground/[0.02]"
							>
								<div>
									<p className="text-sm font-medium">{container.Names}</p>
									<p className="mt-0.5 text-xs text-muted">{container.Status}</p>
								</div>
								<StatusBadge status={(container.State || "offline").toLowerCase()} />
							</Link>
						))}
					</div>
				</Panel>
			) : null}

			{/* Inspect payload */}
			<Panel>
				<PanelHeader>
					<PanelTitle>Inspect payload</PanelTitle>
				</PanelHeader>
				<LogBlock className="max-h-[600px] rounded-none border-0 p-4 text-muted">
					{JSON.stringify(image, null, 2)}
				</LogBlock>
			</Panel>
		</div>
	);
}
