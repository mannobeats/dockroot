import { ArrowLeft, Lock } from "lucide-react";
import {
	controlContainerAction,
	deleteStackAction,
	deployStackAction,
	destroyStackAction,
	updateStackConfigAction,
} from "@/app/(dashboard)/actions";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveStackFeed } from "@/components/live-stack-feed";
import { StackConfigEditor } from "@/components/stack-config-editor";
import { StackServicesAccordion } from "@/components/stack-services-accordion";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { getGlobalSettings, getStackById } from "@/lib/platform";
import { getContainerDetails, listStackContainers } from "@/lib/platform/docker";
import { getProtectedStackLabel, isProtectedManagerStack } from "@/lib/runtime-protection";
import { getServerSession } from "@/lib/session";

export default async function StackWorkspacePage({
	params,
}: {
	params: Promise<{ stackId: string }>;
}) {
	const editorHeight = "min(60vh, 640px)";
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

	const containers = await listStackContainers(stack.slug);
	const containerDetailsMap: Record<string, { inspect: Record<string, unknown>; logs: string }> =
		{};
	for (const container of containers) {
		try {
			const details = await getContainerDetails(container.ID);
			if (details) {
				containerDetailsMap[container.ID] = details;
			}
		} catch {
			// skip containers that can't be inspected
		}
	}
	const latestDeployment = stack.deployments[0];
	const isProtected = isProtectedManagerStack(stack.slug);
	const protectedLabel = getProtectedStackLabel(stack.slug);
	const hasRunningContainers = containers.some((container) => container.State === "running");
	const shouldRedeploy =
		hasRunningContainers ||
		String(stack.status || "")
			.toLowerCase()
			.includes("running") ||
		latestDeployment?.status === "succeeded";

	return (
		<div className="animate-in space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<LinkButton href="/dashboard/stacks" variant="outline" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</LinkButton>
					<div>
						<div className="flex items-center gap-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">
								Stack
							</p>
							<StatusBadge status={stack.status} />
							{isProtected ? (
								<Badge title={protectedLabel || undefined} variant="warning">
									<Lock className="h-2.5 w-2.5" />
									Locked
								</Badge>
							) : null}
						</div>
						<h1 className="text-lg font-semibold">{stack.name}</h1>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<form action={deployStackAction}>
						<input type="hidden" name="stackId" value={stack.id} />
						<FormSubmitButton
							label={shouldRedeploy ? "Redeploy" : "Deploy"}
							pendingLabel={shouldRedeploy ? "Redeploying..." : "Deploying..."}
							size="sm"
							disabled={isProtected}
							title={protectedLabel || undefined}
						/>
					</form>
					<DestructiveActionModal
						action={destroyStackAction}
						title={`Destroy stack ${stack.name}`}
						description="This will stop and remove the stack resources."
						triggerLabel="Destroy"
						confirmLabel="Destroy"
						pendingLabel="Destroying..."
						triggerVariant="danger"
						triggerSize="sm"
						disabled={isProtected}
						hiddenFields={{ stackId: stack.id }}
					/>
					<DestructiveActionModal
						action={deleteStackAction}
						title={`Delete stack ${stack.name}`}
						description="This permanently removes stack metadata from Dockroot."
						triggerLabel="Delete"
						confirmLabel="Delete"
						pendingLabel="Deleting..."
						triggerVariant="quietDanger"
						triggerSize="sm"
						disabled={isProtected}
						hiddenFields={{ stackId: stack.id }}
					/>
				</div>
			</div>

			{/* Source info */}
			<div className="flex flex-wrap gap-3 text-xs text-muted">
				<Badge className="px-2 py-1 text-xs">
					{stack.sourceType === "github" ? "GitHub" : "Manual"}
				</Badge>
				{stack.sourceType === "github" && stack.githubOwner && stack.githubRepository ? (
					<Badge className="px-2 py-1 text-xs">
						{stack.githubOwner}/{stack.githubRepository}
					</Badge>
				) : null}
				{stack.sourceType === "github" && stack.githubBranch ? (
					<Badge className="px-2 py-1 text-xs">{stack.githubBranch}</Badge>
				) : null}
				{stack.sourceType === "github" ? (
					<Badge className="px-2 py-1 text-xs">
						{stack.autoDeployEnabled ? "Auto-deploy: on" : "Auto-deploy: off"}
					</Badge>
				) : null}
				{stack.sourceType === "github" && stack.autoDeployPaths ? (
					<Badge className="px-2 py-1 text-xs">Paths: {stack.autoDeployPaths}</Badge>
				) : null}
			</div>

			{/* Main grid */}
			<div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
				{/* Left: Source + Services */}
				<div className="space-y-5">
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

					{/* Services accordion */}
					<StackServicesAccordion
						containers={containers}
						containerDetailsMap={containerDetailsMap}
						controlContainerAction={controlContainerAction}
						environmentId={stack.environment.id}
						managerUrl={settings.managerUrl}
					/>
				</div>

				{/* Right: Live logs */}
				<div className="space-y-5">
					<LiveStackFeed
						stackId={stack.id}
						initialLog={latestDeployment?.log}
						height={editorHeight}
					/>
				</div>
			</div>
		</div>
	);
}
