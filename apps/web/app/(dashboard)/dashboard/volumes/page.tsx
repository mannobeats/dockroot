import Link from "next/link";
import {
	createVolumeAction,
	pruneVolumesAction,
	removeVolumeAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { listVolumes } from "@/lib/platform/docker";

export default async function VolumesPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; volume?: string }>;
}) {
	const params = await searchParams;
	const query = (params.q || "").toLowerCase();
	const volumes = await listVolumes();
	const filtered = volumes.filter((volume) =>
		!query
			? true
			: `${volume.Name} ${volume.Driver} ${volume.Mountpoint || ""}`.toLowerCase().includes(query),
	);
	const localCount = filtered.filter((volume) => volume.Driver === "local").length;

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Volumes"
				description="Create, inspect, and remove persistent Docker volumes on the manager host."
			/>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="grid gap-3 xl:grid-cols-[1fr_auto_auto]">
					<form className="grid gap-3 md:grid-cols-[1fr_auto]">
						<input
							type="search"
							name="q"
							defaultValue={params.q || ""}
							placeholder="Search volumes"
							className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						/>
						<button
							type="submit"
							className="inline-flex h-11 items-center justify-center rounded-xl border border-default/15 bg-background px-4 text-sm font-medium"
						>
							Filter
						</button>
					</form>
					<form action={createVolumeAction} className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
						<input
							type="text"
							name="name"
							required
							placeholder="app-data"
							className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						/>
						<select
							name="driver"
							defaultValue="local"
							className="h-11 rounded-xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
						>
							<option value="local">local</option>
						</select>
						<FormSubmitButton label="Create" pendingLabel="Creating..." />
					</form>
					<form action={pruneVolumesAction}>
						<FormSubmitButton label="Prune unused" pendingLabel="Pruning..." />
					</form>
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-3">
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Visible volumes</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{filtered.length}</p>
					<p className="mt-2 text-sm text-muted">
						Persistent data attachments available on this engine.
					</p>
				</div>
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Local driver</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">{localCount}</p>
					<p className="mt-2 text-sm text-muted">Volumes stored directly on this Docker host.</p>
				</div>
				<div className="rounded-2xl border border-default/15 bg-surface p-5">
					<p className="text-xs uppercase tracking-[0.18em] text-muted">Custom drivers</p>
					<p className="mt-3 text-3xl font-semibold tracking-tight">
						{filtered.length - localCount}
					</p>
					<p className="mt-2 text-sm text-muted">
						External volume plugins or non-local storage drivers.
					</p>
				</div>
			</section>

			<section className="rounded-2xl border border-default/15 bg-surface p-5">
				<div className="overflow-hidden rounded-xl border border-default/15">
					<table className="min-w-full divide-y divide-default/15 text-left">
						<thead className="bg-background/60 text-[11px] uppercase tracking-[0.18em] text-muted">
							<tr>
								<th className="px-4 py-3 font-medium">Name</th>
								<th className="px-4 py-3 font-medium">Driver</th>
								<th className="px-4 py-3 font-medium">Mount point</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/10 bg-surface/40 text-sm">
							{filtered.length ? (
								filtered.map((volume) => (
									<tr key={`${volume.Name}-${volume.Driver}`}>
										<td className="px-4 py-3 font-medium">
											<Link
												href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}`}
												className="transition-colors hover:text-accent"
											>
												{volume.Name}
											</Link>
										</td>
										<td className="px-4 py-3 text-muted">{volume.Driver}</td>
										<td className="px-4 py-3 text-muted">
											{volume.Mountpoint || "Managed by Docker"}
										</td>
										<td className="px-4 py-3">
											<div className="flex flex-wrap gap-2">
												<Link
													href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}`}
													className="inline-flex h-8 items-center justify-center rounded-lg border border-default/20 bg-background px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
												>
													Details
												</Link>
												<form action={removeVolumeAction}>
													<input type="hidden" name="name" value={volume.Name} />
													<FormSubmitButton
														label="Delete"
														pendingLabel="Deleting..."
														className="inline-flex h-8 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 px-3 text-xs font-medium text-danger"
													/>
												</form>
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
										No volumes matched the current filters.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
