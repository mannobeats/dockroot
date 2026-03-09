import {
	adoptComposeProjectAction,
	controlComposeProjectAction,
	createGitHubStackAction,
	createStackAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StackComposeForm } from "@/components/stack-compose-form";
import { StackGitHubForm } from "@/components/stack-github-form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { isGitHubAppConfigured } from "@/lib/github-app";
import { listEnvironments, listGitHubInstallations, listStacks } from "@/lib/platform";

function normalizeStatus(status: string) {
	return status.split("(")[0]?.trim().toLowerCase() || "unknown";
}

function isRunningStack(status: string, runningCount: number) {
	return runningCount > 0 || normalizeStatus(status).includes("running");
}

export default async function StacksPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; environment?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const includeUntracked = isPrivilegedRole(role);

	const query = await searchParams;
	const detailEnvironmentSuffix = query.environment ? `?environment=${query.environment}` : "";
	const search = (query.q || "").trim().toLowerCase();
	const [stacks, environments, githubInstallations] = await Promise.all([
		listStacks(userId, { includeUntracked }),
		listEnvironments(userId),
		listGitHubInstallations(userId),
	]);
	const filtered = search
		? stacks.filter((stack) =>
				[stack.name, stack.slug, stack.environmentName || ""]
					.join(" ")
					.toLowerCase()
					.includes(search),
			)
		: stacks;
	const trackedCount = filtered.filter((stack) => stack.type === "tracked").length;
	const untrackedCount = filtered.filter((stack) => stack.type === "untracked").length;
	const runningCount = filtered.filter((stack) => stack.runningCount > 0).length;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Operations"
				title="Stacks"
				description={`${filtered.length} compose stacks across all environments`}
			/>

			<div className="grid gap-4 sm:grid-cols-3">
				<MetricCard label="Stacks" value={filtered.length} description="Visible after filters" />
				<MetricCard label="Tracked" value={trackedCount} description="Managed by Dockroot" />
				<MetricCard
					label="Active"
					value={runningCount}
					description={`${untrackedCount} untracked compose stacks`}
				/>
			</div>

			{/* Search */}
			<Panel padding="sm">
				<form className="flex flex-col gap-3 sm:flex-row">
					<Input
						type="search"
						name="q"
						defaultValue={query.q || ""}
						placeholder="Search stacks and environments..."
						className="flex-1"
					/>
					{query.environment ? (
						<input type="hidden" name="environment" value={query.environment} />
					) : null}
					<Button type="submit" variant="secondary">
						Filter
					</Button>
				</form>
			</Panel>

			{/* Table */}
			<Panel>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Source</DataTableHead>
							<DataTableHead>Environment</DataTableHead>
							<DataTableHead>Containers</DataTableHead>
							<DataTableHead>Status</DataTableHead>
							<DataTableHead>Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{filtered.length ? (
							filtered.map((stack) => (
								<DataTableRow key={`${stack.type}-${stack.slug}`} className="group">
									<DataTableCell>
										<div className="space-y-0.5">
											<div className="flex items-center gap-2">
												<p className="font-medium">{stack.name}</p>
												<StatusBadge
													status={
														stack.type === "tracked" ? stack.status : normalizeStatus(stack.status)
													}
												/>
											</div>
											<p className="text-xs text-muted">{stack.slug}</p>
										</div>
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{stack.type === "tracked" ? "Internal" : "Untracked"}
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{stack.environmentName || "—"}
									</DataTableCell>
									<DataTableCell>
										<div className="space-y-0.5">
											<p className="text-sm font-medium">
												{stack.runningCount}/{stack.containerCount}
											</p>
											<p className="text-xs text-muted">
												{stack.containers.length
													? stack.containers.slice(0, 2).map((container, index) => (
															<span key={container.ID}>
																{index ? ", " : null}
																<LinkButton
																	href={`/dashboard/containers/${container.ID}`}
																	variant="ghost"
																	size="xs"
																>
																	{container.Names}
																</LinkButton>
															</span>
														))
													: "—"}
											</p>
										</div>
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{stack.lastDeployment?.status || stack.status}
									</DataTableCell>
									<DataTableCell>
										<div className="flex flex-wrap gap-1.5">
											{stack.type === "tracked" ? (
												<>
													<form action={deployStackAction}>
														<input type="hidden" name="stackId" value={stack.stackId || ""} />
														<FormSubmitButton
															label={
																isRunningStack(stack.status, stack.runningCount)
																	? "Redeploy"
																	: "Deploy"
															}
															pendingLabel={
																isRunningStack(stack.status, stack.runningCount)
																	? "Redeploying..."
																	: "Deploying..."
															}
															size="xs"
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
														triggerSize="xs"
														hiddenFields={{ stackId: stack.stackId || "" }}
													/>
													<LinkButton
														href={`/dashboard/stacks/${stack.stackId}${detailEnvironmentSuffix}`}
														variant="outline"
														size="xs"
													>
														Open
													</LinkButton>
												</>
											) : includeUntracked ? (
												<>
													{isRunningStack(stack.status, stack.runningCount) ? (
														<>
															<form action={controlComposeProjectAction}>
																<input type="hidden" name="projectName" value={stack.slug} />
																<input type="hidden" name="action" value="stop" />
																{stack.configFiles.map((configFile) => (
																	<input
																		key={`stop-${configFile}`}
																		type="hidden"
																		name="configFiles"
																		value={configFile}
																	/>
																))}
																<FormSubmitButton
																	label="Stop"
																	pendingLabel="Stopping..."
																	variant="outline"
																	size="xs"
																/>
															</form>
															<form action={controlComposeProjectAction}>
																<input type="hidden" name="projectName" value={stack.slug} />
																<input type="hidden" name="action" value="restart" />
																{stack.configFiles.map((configFile) => (
																	<input
																		key={`restart-${configFile}`}
																		type="hidden"
																		name="configFiles"
																		value={configFile}
																	/>
																))}
																<FormSubmitButton
																	label="Restart"
																	pendingLabel="Restarting..."
																	variant="outline"
																	size="xs"
																/>
															</form>
														</>
													) : (
														<form action={controlComposeProjectAction}>
															<input type="hidden" name="projectName" value={stack.slug} />
															<input type="hidden" name="action" value="start" />
															{stack.configFiles.map((configFile) => (
																<input
																	key={`start-${configFile}`}
																	type="hidden"
																	name="configFiles"
																	value={configFile}
																/>
															))}
															<FormSubmitButton
																label="Start"
																pendingLabel="Starting..."
																variant="outline"
																size="xs"
															/>
														</form>
													)}
													<DestructiveActionModal
														action={controlComposeProjectAction}
														title={`Destroy compose project ${stack.slug}`}
														description="This will run docker compose down for the selected stack."
														triggerLabel="Destroy"
														confirmLabel="Destroy"
														pendingLabel="Destroying..."
														triggerVariant="danger"
														triggerSize="xs"
														hiddenFields={{
															projectName: stack.slug,
															action: "destroy",
															configFiles: stack.configFiles,
														}}
														options={[
															{
																name: "removeVolumes",
																label: "Remove attached volumes",
																description: "Persistent data may be lost.",
															},
															{
																name: "removeImages",
																label: "Remove local compose images",
																description: "Images will be pulled again on next start.",
															},
														]}
													/>
												</>
											) : null}
											{stack.type === "untracked" && includeUntracked ? (
												<form action={adoptComposeProjectAction}>
													<input type="hidden" name="projectName" value={stack.slug} />
													{stack.configFiles.map((configFile) => (
														<input
															key={`adopt-${configFile}`}
															type="hidden"
															name="configFiles"
															value={configFile}
														/>
													))}
													<FormSubmitButton label="Adopt" pendingLabel="Adopting..." size="xs" />
												</form>
											) : null}
										</div>
									</DataTableCell>
								</DataTableRow>
							))
						) : (
							<DataTableEmpty colSpan={6}>No stacks found.</DataTableEmpty>
						)}
					</DataTableBody>
				</DataTable>
			</Panel>

			<div className="grid gap-5 xl:grid-cols-2">
				<Panel padding="md">
					<div className="mb-4">
						<h2 className="text-base font-semibold">Deploy from GitHub</h2>
						<p className="mt-1 text-sm text-muted">
							Connect a repository, review compose/env, then create a stack.
						</p>
					</div>
					<StackGitHubForm
						environments={environments.map((environment) => ({
							id: environment.id,
							name: environment.name,
							kind: environment.kind,
						}))}
						installations={githubInstallations}
						redirectTo="/dashboard/stacks"
						appConfigured={isGitHubAppConfigured()}
						action={createGitHubStackAction}
					/>
				</Panel>
				<Panel padding="md">
					<div className="mb-4">
						<h2 className="text-base font-semibold">Deploy manually</h2>
						<p className="mt-1 text-sm text-muted">
							Paste compose and env content to create a tracked stack.
						</p>
					</div>
					<StackComposeForm
						environments={environments.map((environment) => ({
							id: environment.id,
							name: environment.name,
							kind: environment.kind,
						}))}
						action={createStackAction}
					/>
				</Panel>
			</div>
		</div>
	);
}
