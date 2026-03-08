import Link from "next/link";
import {
	createVolumeAction,
	pruneVolumesAction,
	removeVolumeAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { listVolumesForEnvironment, resolveRuntimeEnvironment } from "@/lib/environment-runtime";

export default async function VolumesPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; volume?: string; environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(session.userId, params.environment);
	const query = (params.q || "").toLowerCase();
	const { volumes } = await listVolumesForEnvironment(session.userId, environment.id);
	const filtered = volumes.filter((volume: Record<string, string>) =>
		!query
			? true
			: `${volume.Name} ${volume.Driver} ${volume.Mountpoint || ""}`.toLowerCase().includes(query),
	);
	const localCount = filtered.filter(
		(volume: Record<string, string>) => volume.Driver === "local",
	).length;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Volumes"
				description={`${environment.name} — ${filtered.length} volumes`}
			/>

			{/* Actions */}
			<div className="rounded-xl border border-default/10 bg-surface p-4">
				<div className="flex flex-col gap-3 lg:flex-row">
					<form className="flex flex-1 gap-3">
						<input
							type="search"
							name="q"
							defaultValue={params.q || ""}
							placeholder="Search volumes..."
							className="h-9 flex-1 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
						<button
							type="submit"
							className="inline-flex h-9 items-center rounded-lg border border-default/10 px-3 text-sm font-medium"
						>
							Filter
						</button>
					</form>
					<form action={createVolumeAction} className="flex gap-3">
						<input type="hidden" name="environmentId" value={environment.id} />
						<input
							type="text"
							name="name"
							required
							placeholder="app-data"
							className="h-9 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
						<select
							name="driver"
							defaultValue="local"
							className="h-9 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none"
						>
							<option value="local">local</option>
						</select>
						<FormSubmitButton
							label="Create"
							pendingLabel="Creating..."
							className="inline-flex h-9 items-center rounded-lg bg-foreground px-3 text-sm font-medium text-background"
						/>
					</form>
					<form action={pruneVolumesAction}>
						<input type="hidden" name="environmentId" value={environment.id} />
						<FormSubmitButton
							label="Prune"
							pendingLabel="Pruning..."
							className="inline-flex h-9 items-center rounded-lg border border-default/10 px-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
						/>
					</form>
				</div>
			</div>

			{/* Stats */}
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Total</p>
					<p className="mt-1 text-2xl font-semibold">{filtered.length}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Local driver</p>
					<p className="mt-1 text-2xl font-semibold">{localCount}</p>
				</div>
				<div className="rounded-xl border border-default/10 bg-surface p-4">
					<p className="text-xs text-muted">Custom drivers</p>
					<p className="mt-1 text-2xl font-semibold">{filtered.length - localCount}</p>
				</div>
			</div>

			{/* Table */}
			<div className="rounded-xl border border-default/10 bg-surface">
				<div className="table-scroll">
					<table className="min-w-full text-left text-sm">
						<thead>
							<tr className="border-b border-default/10 text-xs text-muted">
								<th className="px-4 py-3 font-medium">Name</th>
								<th className="px-4 py-3 font-medium">Driver</th>
								<th className="px-4 py-3 font-medium">Mount point</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/5">
							{filtered.length ? (
								filtered.map((volume: Record<string, string>) => (
									<tr
										key={`${volume.Name}-${volume.Driver}`}
										className="transition-colors hover:bg-foreground/[0.02]"
									>
										<td className="px-4 py-3">
											<Link
												href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}?environment=${environment.id}`}
												className="font-medium transition-colors hover:text-foreground/80"
											>
												{volume.Name}
											</Link>
										</td>
										<td className="px-4 py-3 text-xs text-muted">{volume.Driver}</td>
										<td className="px-4 py-3 text-xs text-muted">
											{volume.Mountpoint || "Docker managed"}
										</td>
										<td className="px-4 py-3">
											<div className="flex gap-1.5">
												<Link
													href={`/dashboard/volumes/${encodeURIComponent(volume.Name)}?environment=${environment.id}`}
													className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
												>
													Details
												</Link>
												<form action={removeVolumeAction}>
													<input type="hidden" name="name" value={volume.Name} />
													<input type="hidden" name="environmentId" value={environment.id} />
													<FormSubmitButton
														label="Delete"
														pendingLabel="Deleting..."
														className="inline-flex h-7 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
													/>
												</form>
											</div>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={4} className="px-4 py-12 text-center text-sm text-muted">
										No volumes found.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
