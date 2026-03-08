import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
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
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title={decodedRef}
				description={`Image metadata, layer information, and runtime usage on ${environment.name}.`}
				actions={
					<Link
						href={`/dashboard/images?environment=${environment.id}`}
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
						<div className="flex items-center gap-2">
							<h2 className="text-lg font-semibold tracking-tight">Overview</h2>
							<StatusBadge status="healthy" />
							{isProtected ? (
								<span
									title="Dockroot protected images cannot be deleted from the runtime dashboard."
									className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning"
								>
									<Lock className="h-3 w-3" />
									Locked
								</span>
							) : null}
						</div>
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
								attachedContainers.map((container: Record<string, string>) => (
									<Link
										key={container.ID}
										href={`/dashboard/containers/${container.ID}?environment=${environment.id}`}
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
					<pre className="log-viewport mt-4 max-h-[720px] rounded-xl bg-[#050914] p-4 text-xs leading-6 text-white/85">
						{JSON.stringify(image, null, 2)}
					</pre>
				</section>
			</div>
		</div>
	);
}
