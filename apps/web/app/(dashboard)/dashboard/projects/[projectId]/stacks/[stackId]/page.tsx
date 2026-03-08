import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
import { getStackById } from "@/lib/platform";
import { getContainerDetails, listStackContainers } from "@/lib/platform/docker";
import { getServerSession } from "@/lib/session";

export default async function StackWorkspacePage({
	params,
}: {
	params: Promise<{ projectId: string; stackId: string }>;
}) {
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

	return (
		<div className="animate-in space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<Link
						href={`/dashboard/projects/${projectId}`}
						className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-default/10 text-muted transition-colors hover:text-foreground"
					>
						<ArrowLeft className="h-4 w-4" />
					</Link>
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
							label="Deploy"
							pendingLabel="Deploying..."
							className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
						/>
					</form>
					<form action={destroyStackAction}>
						<input type="hidden" name="stackId" value={stack.id} />
						<FormSubmitButton
							label="Destroy"
							pendingLabel="..."
							className="inline-flex h-8 items-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
						/>
					</form>
					<form action={deleteStackAction}>
						<input type="hidden" name="stackId" value={stack.id} />
						<input type="hidden" name="projectId" value={projectId} />
						<FormSubmitButton
							label="Delete"
							pendingLabel="..."
							className="inline-flex h-8 items-center rounded-md border border-default/10 px-3 text-xs font-medium text-muted transition-colors hover:text-red-600"
						/>
					</form>
				</div>
			</div>

			{/* Source info */}
			<div className="flex flex-wrap gap-3 text-xs text-muted">
				<span className="rounded-md bg-foreground/[0.04] px-2 py-1">
					{stack.sourceType === "github" ? "GitHub" : "Manual"}
				</span>
				{stack.sourceType === "github" && stack.githubOwner && stack.githubRepository ? (
					<span className="rounded-md bg-foreground/[0.04] px-2 py-1">
						{stack.githubOwner}/{stack.githubRepository}
					</span>
				) : null}
				{stack.sourceType === "github" && stack.githubBranch ? (
					<span className="rounded-md bg-foreground/[0.04] px-2 py-1">{stack.githubBranch}</span>
				) : null}
			</div>

			{/* Main grid */}
			<div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
				{/* Left: Source + Services */}
				<div className="space-y-5">
					{/* Compose files */}
					<div className="grid gap-0 overflow-hidden rounded-xl border border-default/10 xl:grid-cols-[1.4fr_0.6fr]">
						<div className="border-b border-default/10 xl:border-b-0 xl:border-r">
							<div className="border-b border-default/5 bg-surface px-4 py-2">
								<p className="text-xs font-medium">{stack.composeFileName}</p>
							</div>
							<CodeEditor value={stack.composeYaml} language="yaml" readOnly minHeight="320px" />
						</div>
						<div>
							<div className="border-b border-default/5 bg-surface px-4 py-2">
								<p className="text-xs font-medium">{stack.envFileName || ".env"}</p>
							</div>
							<CodeEditor
								value={stack.envFileContent || "# No env file configured"}
								language="env"
								readOnly
								minHeight="320px"
							/>
						</div>
					</div>

					{/* Services accordion */}
					<StackServicesAccordion
						containers={containers}
						containerDetailsMap={containerDetailsMap}
						controlContainerAction={controlContainerAction}
					/>
				</div>

				{/* Right: Live logs */}
				<div className="space-y-5">
					<LiveStackFeed stackId={stack.id} initialLog={latestDeployment?.log} />
				</div>
			</div>
		</div>
	);
}
