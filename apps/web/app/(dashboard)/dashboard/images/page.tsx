import {
	bulkRemoveImagesAction,
	pruneImagesAction,
	pullImageAction,
	removeImageAction,
} from "@/app/(dashboard)/actions";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { ImagesTableWorkspace } from "@/components/images-table-workspace";
import { PageHeader } from "@/components/page-header";
import { PullImageModal } from "@/components/pull-image-modal";
import { RuntimeUnavailablePanel } from "@/components/runtime-unavailable-panel";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import {
	getRuntimeConnectionMessage,
	isRuntimeConnectionError,
	listContainersForEnvironment,
	listImagesForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { getProtectedImageRefs } from "@/lib/runtime-protection";

export default async function ImagesPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; image?: string; environment?: string }>;
}) {
	const session = await requirePrivilegedPageSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(session.userId, params.environment);
	const query = (params.q || "").toLowerCase();
	let runtimeIssue: string | null = null;
	const { images } = await listImagesForEnvironment(session.userId, environment.id).catch(
		(error) => {
			if (isRuntimeConnectionError(error)) {
				runtimeIssue = getRuntimeConnectionMessage(error);
				return { environment, images: [] };
			}
			throw error;
		},
	);
	const filtered = images.filter((image: Record<string, string>) =>
		!query
			? true
			: `${image.Repository}:${image.Tag}`.toLowerCase().includes(query) ||
				(image.ID || "").toLowerCase().includes(query),
	);
	const { containers } = await listContainersForEnvironment(session.userId, environment.id).catch(
		(error) => {
			if (isRuntimeConnectionError(error)) {
				runtimeIssue = getRuntimeConnectionMessage(error);
				return { environment, containers: [] };
			}
			throw error;
		},
	);
	const protectedImageRefs =
		environment.kind === "local" ? getProtectedImageRefs(containers) : new Set<string>();
	const containerImageRefs = new Set<string>(
		containers
			.map((container: Record<string, string>) => container.Image)
			.filter((imageRef: string): imageRef is string => Boolean(imageRef)),
	);
	const inUseCount = filtered.filter((image: Record<string, string>) =>
		containerImageRefs.has(`${image.Repository}:${image.Tag}`),
	).length;
	const danglingCount = filtered.filter(
		(image: Record<string, string>) => image.Repository === "<none>" || image.Tag === "<none>",
	).length;

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Images"
				description={`${environment.name} · ${filtered.length} images · ${inUseCount} in use · ${danglingCount} dangling`}
				actions={
					<div className="flex items-center gap-1.5">
						<DestructiveActionModal
							action={pruneImagesAction}
							title="Prune dangling images"
							description="This removes dangling images that are no longer referenced."
							triggerLabel="Prune dangling"
							confirmLabel="Prune"
							pendingLabel="Pruning..."
							triggerVariant="outline"
							triggerSize="xs"
							hiddenFields={{ environmentId: environment.id }}
						/>
						<DestructiveActionModal
							action={pruneImagesAction}
							title="Prune unused images"
							description="This removes all unused local images and can impact redeploy speed."
							triggerLabel="Prune unused"
							confirmLabel="Prune"
							pendingLabel="Pruning..."
							triggerVariant="warning"
							triggerSize="xs"
							hiddenFields={{ environmentId: environment.id, mode: "all" }}
						/>
						<PullImageModal action={pullImageAction} environmentId={environment.id} />
					</div>
				}
			/>

			{runtimeIssue ? (
				<RuntimeUnavailablePanel title="Images unavailable" message={runtimeIssue} />
			) : null}

			<Panel>
				<form className="border-b border-default/8 px-3 py-2">
					<Input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search images..."
						className="w-full"
					/>
				</form>
				{inUseCount ? (
					<p className="border-b border-default/8 px-3 py-2 text-xs text-muted">
						{inUseCount} image(s) are currently in use by containers and cannot be deleted.
					</p>
				) : null}

				<ImagesTableWorkspace
					images={filtered as Array<Record<string, string>>}
					environmentId={environment.id}
					removeImageAction={removeImageAction}
					bulkRemoveImagesAction={bulkRemoveImagesAction}
					protectedImageRefs={Array.from(protectedImageRefs)}
					inUseImageRefs={Array.from(containerImageRefs)}
				/>
			</Panel>
		</div>
	);
}
