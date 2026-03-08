import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
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
					<Link
						href={`/dashboard/images?environment=${environment.id}`}
						className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-default/10 text-muted transition-colors hover:text-foreground"
					>
						<ArrowLeft className="h-4 w-4" />
					</Link>
					<div>
						<div className="flex items-center gap-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">
								Image
							</p>
							<StatusBadge status="healthy" />
							{isProtected ? (
								<span
									title="Dockroot protected image"
									className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
								>
									<Lock className="h-2.5 w-2.5" />
									Locked
								</span>
							) : null}
						</div>
						<h1 className="text-lg font-semibold">{decodedRef}</h1>
					</div>
				</div>
			</div>

			{/* Info grid */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Architecture</p>
					<p className="mt-1 text-sm font-medium">{String(image.Architecture || "unknown")}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">OS</p>
					<p className="mt-1 text-sm font-medium">{String(image.Os || "unknown")}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Size</p>
					<p className="mt-1 text-sm font-medium">{String(image.Size || "unknown")}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Containers</p>
					<p className="mt-1 text-sm font-medium">{attachedContainers.length}</p>
				</div>
			</div>

			{/* Runtime usage */}
			{attachedContainers.length ? (
				<div className="rounded-xl border border-default/10 bg-surface">
					<div className="border-b border-default/10 px-4 py-3">
						<h2 className="text-sm font-semibold">Runtime usage</h2>
					</div>
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
				</div>
			) : null}

			{/* Inspect payload */}
			<div className="rounded-xl border border-default/10 bg-surface">
				<div className="border-b border-default/10 px-4 py-3">
					<h2 className="text-sm font-semibold">Inspect payload</h2>
				</div>
				<pre className="log-viewport max-h-[600px] p-4 text-xs leading-6 text-muted">
					{JSON.stringify(image, null, 2)}
				</pre>
			</div>
		</div>
	);
}
