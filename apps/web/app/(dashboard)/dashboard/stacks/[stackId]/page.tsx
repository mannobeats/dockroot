import { ArrowLeft, Lock, Play, RotateCcw } from "lucide-react";
import {
	controlContainerAction,
	deleteStackAction,
	deployStackAction,
	updateStackConfigAction,
} from "@/app/(dashboard)/actions";
import { DeployLogTrigger } from "@/components/deploy-log-trigger";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { RuntimeUnavailablePanel } from "@/components/runtime-unavailable-panel";
import { StackConfigEditor } from "@/components/stack-config-editor";
import { StackServicesAccordion } from "@/components/stack-services-accordion";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import {
	getContainerDetailsForEnvironment,
	getRuntimeConnectionMessage,
	isRuntimeConnectionError,
	listContainersForEnvironment,
} from "@/lib/environment-runtime";
import { getGlobalSettings, getStackById } from "@/lib/platform";
import { getProtectedStackLabel, isProtectedManagerStack } from "@/lib/runtime-protection";
import { getServerSession } from "@/lib/session";

type RuntimeContainer = Record<string, string>;

export default async function StackWorkspacePage({
	params,
}: {
	params: Promise<{ stackId: string }>;
}) {
	const editorHeight = "min(70vh, 800px)";
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const { stackId } = await params;
	const [stack, settings] = await Promise.all([
		getStackById({
			stackId,
			userId: session.user.id,
		}),
		getGlobalSettings(session.user.id),
	]);

	if (!stack) {
		return <div className="text-sm text-muted">Stack not found.</div>;
	}

	const runtimeUrl =
		stack.environment.kind === "agent"
			? stack.environment.managerUrl || undefined
			: settings.managerUrl || stack.environment.managerUrl || undefined;
	let runtimeIssue: string | null = null;
	const environmentContainers = await listContainersForEnvironment(
		session.user.id,
		stack.environment.id,
	)
		.then((result) => result.containers)
		.catch((error) => {
			if (isRuntimeConnectionError(error)) {
				runtimeIssue = getRuntimeConnectionMessage(error);
				return [];
			}
			throw error;
		});
	const containers = environmentContainers.filter((container: RuntimeContainer) => {
		const labels = String(container.Labels || "");
		const composeProject = labels
			.split(",")
			.find((label) => label.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=");
		return composeProject === stack.slug;
	});
	const containerDetailsMap: Record<string, { inspect: Record<string, unknown>; logs: string }> =
		{};
	for (const container of containers) {
		try {
			const details = await getContainerDetailsForEnvironment(
				session.user.id,
				container.ID,
				stack.environment.id,
			);
			if (details.details) {
				containerDetailsMap[container.ID] = details.details;
			}
		} catch {
			// skip containers that can't be inspected
		}
	}
	const latestDeployment = stack.deployments[0];
	const isProtected = isProtectedManagerStack(stack.slug);
	const protectedLabel = getProtectedStackLabel(stack.slug);
	const hasRunningContainers = containers.some(
		(container: RuntimeContainer) => container.State === "running",
	);
	const shouldRedeploy =
		hasRunningContainers ||
		String(stack.status || "")
			.toLowerCase()
			.includes("running") ||
		latestDeployment?.status === "succeeded";

	return (
		<div className="animate-in space-y-5">
			{/* Header */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5">
					<LinkButton href="/dashboard/stacks" variant="ghost" size="icon-sm">
						<ArrowLeft className="h-4 w-4" />
					</LinkButton>
					<div>
						<div className="flex items-center gap-2">
							<h1 className="text-lg font-semibold">{stack.name}</h1>
							<StatusBadge status={stack.status} />
							{isProtected ? (
								<Badge title={protectedLabel || undefined} variant="warning">
									<Lock className="h-2.5 w-2.5" />
								</Badge>
							) : null}
						</div>
						{/* Source badges */}
						<div className="mt-0.5 flex flex-wrap items-center gap-1.5">
							<Badge>{stack.sourceType === "github" ? "GitHub" : "Manual"}</Badge>
							{stack.sourceType === "github" && stack.githubOwner && stack.githubRepository ? (
								<Badge>
									{stack.githubOwner}/{stack.githubRepository}
								</Badge>
							) : null}
							{stack.sourceType === "github" && stack.githubBranch ? (
								<Badge>{stack.githubBranch}</Badge>
							) : null}
							{stack.sourceType === "github" ? (
								<Badge>{stack.autoDeployEnabled ? "Auto-deploy" : "Manual deploy"}</Badge>
							) : null}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-1.5">
					<DeployLogTrigger
						stackId={stack.id}
						stackName={stack.name}
						initialLog={latestDeployment?.log}
					/>
					<form action={deployStackAction}>
						<input type="hidden" name="stackId" value={stack.id} />
						<FormSubmitButton
							label=""
							pendingLabel=""
							size="icon-sm"
							disabled={isProtected}
							title={shouldRedeploy ? "Redeploy" : "Deploy"}
							className="h-8 w-8"
						>
							{shouldRedeploy ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
						</FormSubmitButton>
					</form>
					<DestructiveActionModal
						action={deleteStackAction}
						title={`Remove stack ${stack.name}`}
						description="This permanently removes the stack, its configuration, and deployment history from Dockroot."
						triggerLabel="Remove"
						confirmLabel="Remove"
						pendingLabel="Removing..."
						triggerVariant="quietDanger"
						triggerSize="xs"
						disabled={isProtected}
						hiddenFields={{ stackId: stack.id }}
					/>
				</div>
			</div>

			{runtimeIssue ? (
				<RuntimeUnavailablePanel title="Stack services unavailable" message={runtimeIssue} />
			) : null}

			{/* Editor + Services */}
			<div className="space-y-4">
				<StackConfigEditor
					stackId={stack.id}
					composeFileName={stack.composeFileName}
					envFileName={stack.envFileName}
					initialComposeYaml={stack.composeYaml}
					initialEnvFileContent={stack.envFileContent}
					editorHeight={editorHeight}
					action={updateStackConfigAction}
					disabled={isProtected}
					disabledReason={isProtected ? protectedLabel || undefined : undefined}
				/>

				<StackServicesAccordion
					containers={containers}
					containerDetailsMap={containerDetailsMap}
					controlContainerAction={controlContainerAction}
					environmentId={stack.environment.id}
					managerUrl={runtimeUrl}
				/>
			</div>
		</div>
	);
}
