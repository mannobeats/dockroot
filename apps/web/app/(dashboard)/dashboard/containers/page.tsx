import {
	applyContainerUpdatesAction,
	bulkApplyContainerUpdatesAction,
	bulkCheckContainerUpdatesAction,
	bulkControlContainerAction,
	checkContainerUpdatesAction,
	controlContainerAction,
	createContainerAction,
	setContainerUpdatePolicyAction,
} from "@/app/(dashboard)/actions";
import { ContainersTableWorkspace } from "@/components/containers-table-workspace";
import { CreateContainerModal } from "@/components/create-container-modal";
import { LiveRuntimePanel } from "@/components/live-runtime-panel";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { getContainerUpdatePolicyMap, getContainerUpdateStateMap } from "@/lib/container-updates";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";
import { getGlobalSettings } from "@/lib/platform";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";
import { getProtectedContainerLabel, isProtectedManagerContainer } from "@/lib/runtime-protection";

export default async function ContainersPage({
	searchParams,
}: {
	searchParams: Promise<{
		q?: string;
		status?: string;
		environment?: string;
		watchStackId?: string;
	}>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(userId, params.environment);
	const settings = await getGlobalSettings(userId);
	const query = (params.q || "").toLowerCase();
	const status = (params.status || "all").toLowerCase();
	const watchStackId = (params.watchStackId || "").trim();
	const containers = await listAccessibleContainersForUser(userId, role, environment.id);
	const includeRuntime = isPrivilegedRole(role) && environment.kind === "local";
	const filtered = containers.filter((container: Record<string, string>) => {
		const matchesQuery =
			!query ||
			container.Names?.toLowerCase().includes(query) ||
			container.Image?.toLowerCase().includes(query);
		const matchesStatus = status === "all" || (container.State || "").toLowerCase() === status;
		return matchesQuery && matchesStatus;
	});
	const runningCount = filtered.filter(
		(container: Record<string, string>) => container.State === "running",
	).length;
	const { map: policyMap } = await getContainerUpdatePolicyMap(userId, environment.id);
	const { map: stateMap } = await getContainerUpdateStateMap(userId, environment.id);
	const updatePolicyMap: Record<
		string,
		{
			checkEnabled: boolean;
			updateEnabled: boolean;
		}
	> = {};
	for (const [name, value] of policyMap) {
		updatePolicyMap[name] = {
			checkEnabled: value.checkEnabled,
			updateEnabled: value.updateEnabled,
		};
	}
	const updateStateMap: Record<
		string,
		{
			updateAvailable: boolean;
			majorUpdateAvailable: boolean;
			majorTargetImageRef?: string | null;
			majorTargetTag?: string | null;
			lastResult: string | null;
			lastError?: string | null;
			checkedAt: Date | null;
			updatedAt: Date | null;
		}
	> = {};
	for (const [name, value] of stateMap) {
		updateStateMap[name] = {
			updateAvailable: value.updateAvailable,
			majorUpdateAvailable: value.majorUpdateAvailable,
			majorTargetImageRef: value.majorTargetImageRef,
			majorTargetTag: value.majorTargetTag,
			lastResult: value.lastResult,
			lastError: value.lastError,
			checkedAt: value.checkedAt,
			updatedAt: value.updatedAt,
		};
	}
	const protectedContainerIds =
		environment.kind === "local"
			? filtered
					.filter((container: Record<string, string>) => isProtectedManagerContainer(container))
					.map((container: Record<string, string>) => container.ID)
			: [];
	const protectedContainerLabels: Record<string, string> = {};
	if (environment.kind === "local") {
		for (const container of filtered as Array<Record<string, string>>) {
			if (!isProtectedManagerContainer(container)) {
				continue;
			}
			protectedContainerLabels[container.ID] = getProtectedContainerLabel(container) || "";
		}
	}

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Containers"
				description={`${environment.name} · ${filtered.length} containers · ${runningCount} running`}
				actions={
					<CreateContainerModal
						action={createContainerAction}
						environmentId={environment.id}
					/>
				}
			/>

			{includeRuntime ? <LiveRuntimePanel /> : null}

			{/* Inline search + filter */}
			<Panel>
				<form className="flex items-center gap-2 border-b border-default/8 px-3 py-2">
					<Input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search by name or image..."
						className="flex-1"
					/>
					<Select name="status" defaultValue={status} className="w-32 h-7 text-xs">
						<option value="all">All</option>
						<option value="running">Running</option>
						<option value="exited">Exited</option>
						<option value="created">Created</option>
						<option value="paused">Paused</option>
					</Select>
					<button type="submit" className="text-xs font-medium text-accent hover:text-accent/80">
						Filter
					</button>
				</form>
				<ContainersTableWorkspace
					containers={filtered as Array<Record<string, string>>}
					environmentId={environment.id}
					managerUrl={settings.managerUrl || undefined}
					controlContainerAction={controlContainerAction}
					bulkControlContainerAction={bulkControlContainerAction}
					checkContainerUpdatesAction={checkContainerUpdatesAction}
					bulkCheckContainerUpdatesAction={bulkCheckContainerUpdatesAction}
					applyContainerUpdatesAction={applyContainerUpdatesAction}
					bulkApplyContainerUpdatesAction={bulkApplyContainerUpdatesAction}
					setContainerUpdatePolicyAction={setContainerUpdatePolicyAction}
					protectedContainerIds={protectedContainerIds}
					protectedContainerLabels={protectedContainerLabels}
					initialWatchStackId={watchStackId}
					updatePolicyMap={updatePolicyMap}
					updateStateMap={updateStateMap}
				/>
			</Panel>
		</div>
	);
}
