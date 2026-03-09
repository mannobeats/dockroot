import { Lock } from "lucide-react";
import Link from "next/link";
import { controlContainerAction } from "@/app/(dashboard)/actions";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveRuntimePanel } from "@/components/live-runtime-panel";
import { PageHeader } from "@/components/page-header";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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
import { Select } from "@/components/ui/select";
import { UtilizationBar } from "@/components/ui/utilization-bar";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";
import { getGlobalSettings } from "@/lib/platform";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";
import { getProtectedContainerLabel, isProtectedManagerContainer } from "@/lib/runtime-protection";

function summarizeComposeProject(labels: string | undefined) {
	if (!labels) {
		return "";
	}
	return (
		labels
			.split(",")
			.find((entry) => entry.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=") || ""
	);
}

export default async function ContainersPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; status?: string; environment?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(userId, params.environment);
	const settings = await getGlobalSettings(userId);
	const query = (params.q || "").toLowerCase();
	const status = (params.status || "all").toLowerCase();
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
	const publishedCount = filtered.filter((container: Record<string, string>) =>
		container.Ports?.includes("->"),
	).length;
	const stoppedCount = Math.max(filtered.length - runningCount, 0);

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Containers"
				description={`${environment.name} — ${filtered.length} containers, ${runningCount} running`}
				actions={
					<>
						<LinkButton href={`/dashboard/logs?environment=${environment.id}`} variant="secondary">
							Logs workspace
						</LinkButton>
						<LinkButton href={`/dashboard/shell?environment=${environment.id}`}>
							Shell workspace
						</LinkButton>
					</>
				}
			/>

			{includeRuntime ? <LiveRuntimePanel /> : null}

			<div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
				<div className="grid gap-4 sm:grid-cols-3">
					<MetricCard label="Total" value={filtered.length} />
					<MetricCard label="Running" value={runningCount} />
					<MetricCard label="Published ports" value={publishedCount} />
				</div>
				<Panel padding="md" className="space-y-3">
					<p className="text-sm font-semibold">Runtime distribution</p>
					<UtilizationBar
						label="Running"
						valueLabel={`${runningCount}/${filtered.length || 0}`}
						percent={filtered.length ? (runningCount / filtered.length) * 100 : 0}
						helper="Containers currently available to serve traffic"
					/>
					<UtilizationBar
						label="Stopped / idle"
						valueLabel={`${stoppedCount}/${filtered.length || 0}`}
						percent={filtered.length ? (stoppedCount / filtered.length) * 100 : 0}
						helper="Containers requiring start/recovery actions"
					/>
				</Panel>
			</div>

			<Panel padding="sm">
				<form className="flex flex-col gap-3 sm:flex-row">
					<Input
						type="search"
						name="q"
						defaultValue={params.q || ""}
						placeholder="Search by container name or image"
						className="flex-1"
					/>
					<Select name="status" defaultValue={status}>
						<option value="all">All statuses</option>
						<option value="running">Running</option>
						<option value="exited">Exited</option>
						<option value="created">Created</option>
						<option value="paused">Paused</option>
					</Select>
					<Button type="submit" variant="secondary">
						Apply filters
					</Button>
				</form>
			</Panel>

			<Panel>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Image</DataTableHead>
							<DataTableHead>State</DataTableHead>
							<DataTableHead>Status</DataTableHead>
							<DataTableHead>Ports</DataTableHead>
							<DataTableHead>Size</DataTableHead>
							<DataTableHead>Quick actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{filtered.length ? (
							filtered.map((container: Record<string, string>) => {
								const isProtected =
									environment.kind === "local" && isProtectedManagerContainer(container);
								const protectedLabel =
									environment.kind === "local" ? getProtectedContainerLabel(container) : "";
								const state = (container.State || "").toLowerCase();
								const isRunning = state === "running";
								const composeProject = summarizeComposeProject(container.Labels);

								return (
									<DataTableRow key={`${container.ID}-${container.Names}`} className="group">
										<DataTableCell>
											<div className="space-y-0.5">
												<div className="flex items-center gap-2">
													<Link
														href={`/dashboard/containers/${container.ID}?environment=${environment.id}`}
														className="font-medium transition-colors hover:text-foreground/80"
													>
														{container.Names}
													</Link>
													{isProtected ? (
														<Badge title={protectedLabel || undefined} variant="warning">
															<Lock className="h-2.5 w-2.5" />
															Locked
														</Badge>
													) : null}
												</div>
												{composeProject ? (
													<p className="text-xs text-muted">{composeProject}</p>
												) : null}
											</div>
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">{container.Image}</DataTableCell>
										<DataTableCell>
											<StatusBadge status={state || "offline"} />
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">
											{container.Status || "—"}
										</DataTableCell>
										<DataTableCell>
											<RuntimePortLinks
												ports={container.Ports}
												compact
												managerUrl={settings.managerUrl}
											/>
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">
											{container.Size || "—"}
										</DataTableCell>
										<DataTableCell>
											<div className="flex flex-wrap gap-1.5">
												<LinkButton
													href={`/dashboard/containers/${container.ID}?environment=${environment.id}`}
													size="xs"
												>
													Open
												</LinkButton>
												{isRunning ? (
													<>
														<form action={controlContainerAction}>
															<input type="hidden" name="containerId" value={container.ID} />
															<input type="hidden" name="action" value="stop" />
															<input type="hidden" name="environmentId" value={environment.id} />
															<FormSubmitButton
																label="Stop"
																pendingLabel="Stopping..."
																disabled={isProtected}
																variant="outline"
																size="xs"
															/>
														</form>
														<form action={controlContainerAction}>
															<input type="hidden" name="containerId" value={container.ID} />
															<input type="hidden" name="action" value="restart" />
															<input type="hidden" name="environmentId" value={environment.id} />
															<FormSubmitButton
																label="Restart"
																pendingLabel="Restarting..."
																disabled={isProtected}
																variant="outline"
																size="xs"
															/>
														</form>
													</>
												) : (
													<>
														<form action={controlContainerAction}>
															<input type="hidden" name="containerId" value={container.ID} />
															<input type="hidden" name="action" value="start" />
															<input type="hidden" name="environmentId" value={environment.id} />
															<FormSubmitButton
																label="Start"
																pendingLabel="Starting..."
																disabled={isProtected}
																variant="outline"
																size="xs"
															/>
														</form>
														<DestructiveActionModal
															action={controlContainerAction}
															title={`Remove container ${container.Names}`}
															description="This permanently removes the container."
															triggerLabel="Remove"
															confirmLabel="Remove"
															pendingLabel="Removing..."
															triggerVariant="danger"
															triggerSize="xs"
															disabled={isProtected}
															hiddenFields={{
																containerId: container.ID,
																action: "remove",
																environmentId: environment.id,
															}}
															options={[
																{
																	name: "removeVolumes",
																	label: "Remove anonymous volumes",
																	description: "Data in attached anonymous volumes will be lost.",
																},
															]}
														/>
													</>
												)}
												<LinkButton
													href={`/dashboard/shell?target=container&containerId=${container.ID}&environment=${environment.id}`}
													variant="outline"
													size="xs"
												>
													Shell
												</LinkButton>
												<LinkButton
													href={`/dashboard/logs?mode=single&container=${container.ID}&environment=${environment.id}`}
													variant="outline"
													size="xs"
												>
													Logs
												</LinkButton>
											</div>
										</DataTableCell>
									</DataTableRow>
								);
							})
						) : (
							<DataTableEmpty colSpan={7}>
								No containers matched the current filters.
							</DataTableEmpty>
						)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
