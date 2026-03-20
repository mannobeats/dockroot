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
import { ContainersPageWorkspace } from "@/components/containers-page-workspace";
import { CreateContainerModal } from "@/components/create-container-modal";
import { PageHeader } from "@/components/page-header";
import { RuntimeUnavailablePanel } from "@/components/runtime-unavailable-panel";
import { requireUserSession } from "@/lib/authorization";
import { getContainerUpdatePolicyMap, getContainerUpdateStateMap } from "@/lib/container-updates";
import {
	getRuntimeConnectionMessage,
	isRuntimeConnectionError,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
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
	const runtimeUrl =
		environment.kind === "agent"
			? environment.managerUrl || undefined
			: settings.managerUrl || environment.managerUrl || undefined;
	const watchStackId = (params.watchStackId || "").trim();
	let runtimeIssue: string | null = null;
	const containers = await listAccessibleContainersForUser(userId, role, environment.id).catch(
		(error) => {
			if (isRuntimeConnectionError(error)) {
				runtimeIssue = getRuntimeConnectionMessage(error);
				return [];
			}
			throw error;
		},
	);
	const runningCount = containers.filter(
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
	const protectedContainerLabels: Record<string, string> = {};
	if (environment.kind === "local") {
		for (const container of containers as Array<Record<string, string>>) {
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
				description={`${environment.name} · ${containers.length} containers · ${runningCount} running`}
				actions={
					<CreateContainerModal action={createContainerAction} environmentId={environment.id} />
				}
			/>

			{runtimeIssue ? (
				<RuntimeUnavailablePanel title="Containers unavailable" message={runtimeIssue} />
			) : null}

			<ContainersPageWorkspace
				containers={containers as Array<Record<string, string>>}
				environmentId={environment.id}
				environmentKind={environment.kind}
				managerUrl={runtimeUrl}
				controlContainerAction={controlContainerAction}
				bulkControlContainerAction={bulkControlContainerAction}
				checkContainerUpdatesAction={checkContainerUpdatesAction}
				bulkCheckContainerUpdatesAction={bulkCheckContainerUpdatesAction}
				applyContainerUpdatesAction={applyContainerUpdatesAction}
				bulkApplyContainerUpdatesAction={bulkApplyContainerUpdatesAction}
				setContainerUpdatePolicyAction={setContainerUpdatePolicyAction}
				protectedContainerLabels={protectedContainerLabels}
				initialWatchStackId={watchStackId}
				updatePolicyMap={updatePolicyMap}
				updateStateMap={updateStateMap}
				initialQuery={params.q || ""}
				initialStatus={params.status || "all"}
			/>
		</div>
	);
}
