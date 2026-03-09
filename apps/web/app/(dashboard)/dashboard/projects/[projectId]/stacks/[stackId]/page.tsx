import { ArrowLeft } from "lucide-react";
import {
	controlContainerAction,
	deleteStackAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { CodeEditor } from "@/components/code-editor";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveStackFeed } from "@/components/live-stack-feed";
import { StackServicesAccordion } from "@/components/stack-services-accordion";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { getStackById } from "@/lib/platform";
import { getContainerDetails, listStackContainers } from "@/lib/platform/docker";
import { getServerSession } from "@/lib/session";

export default async function StackWorkspacePage({
	params,
}: {
	params: Promise<{ projectId: string; stackId: string }>;
}) {
	const editorHeight = "min(60vh, 640px)";
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const { projectId, stackId } = await params;
	const stack = await getStackById({
		stackId,
		projectId,
		userId: session.user.id,
	});

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
					<LinkButton href={`/dashboard/projects/${projectId}`} variant="outline" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</LinkButton>
					<div>
						<div className="flex items-center gap-2">
							<p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted">
								Stack
							</p>
							<StatusBadge status={stack.status} />
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
						/>
					</form>
					<form action={destroyStackAction}>
						<input type="hidden" name="stackId" value={stack.id} />
						<FormSubmitButton label="Destroy" pendingLabel="..." variant="danger" size="sm" />
					</form>
					<form action={deleteStackAction}>
						<input type="hidden" name="stackId" value={stack.id} />
						<input type="hidden" name="projectId" value={projectId} />
						<FormSubmitButton label="Delete" pendingLabel="..." variant="quietDanger" size="sm" />
					</form>
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
			</div>

			{/* Main grid */}
			<div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
				{/* Left: Source + Services */}
				<div className="space-y-5">
					{/* Compose files */}
					<Panel className="grid gap-0 overflow-hidden xl:grid-cols-[1.4fr_0.6fr]">
						<div className="min-h-0 border-b border-default/10 xl:border-b-0 xl:border-r">
							<div className="border-b border-default/5 bg-surface px-4 py-2">
								<p className="text-xs font-medium">{stack.composeFileName}</p>
							</div>
							<CodeEditor
								value={stack.composeYaml}
								language="yaml"
								readOnly
								minHeight="320px"
								maxHeight={editorHeight}
								height={editorHeight}
							/>
						</div>
						<div className="min-h-0">
							<div className="border-b border-default/5 bg-surface px-4 py-2">
								<p className="text-xs font-medium">{stack.envFileName || ".env"}</p>
							</div>
							<CodeEditor
								value={stack.envFileContent || "# No env file configured"}
								language="env"
								readOnly
								minHeight="320px"
								maxHeight={editorHeight}
								height={editorHeight}
							/>
						</div>
					</Panel>

					{/* Services accordion */}
					<StackServicesAccordion
						containers={containers}
						containerDetailsMap={containerDetailsMap}
						controlContainerAction={controlContainerAction}
						environmentId={stack.environment.id}
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
