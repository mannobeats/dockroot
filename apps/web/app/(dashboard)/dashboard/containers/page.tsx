import { ExternalLink, Lock, Play, RefreshCw, Square, SquareTerminal, Logs as LogsIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { controlContainerAction } from "@/app/(dashboard)/actions";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveRuntimePanel } from "@/components/live-runtime-panel";
import { PageHeader } from "@/components/page-header";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
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

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Containers"
				description={`${environment.name} · ${filtered.length} containers · ${runningCount} running`}
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
						className="flex-1 border-0 bg-transparent shadow-none focus:ring-0"
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

				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Image</DataTableHead>
							<DataTableHead>State</DataTableHead>
							<DataTableHead>Status</DataTableHead>
							<DataTableHead>Ports</DataTableHead>
							<DataTableHead className="w-24 text-right">Actions</DataTableHead>
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
									<DataTableRow key={`${container.ID}-${container.Names}`}>
										<DataTableCell>
											<div className="flex items-center gap-1.5">
												<Link
													href={`/dashboard/containers/${container.ID}?environment=${environment.id}`}
													className="font-medium transition-colors hover:text-accent"
												>
													{container.Names}
												</Link>
												{isProtected ? (
													<Badge title={protectedLabel || undefined} variant="warning">
														<Lock className="h-2.5 w-2.5" />
													</Badge>
												) : null}
											</div>
											{composeProject ? (
												<p className="text-[11px] text-muted">{composeProject}</p>
											) : null}
										</DataTableCell>
										<DataTableCell className="text-xs text-muted max-w-[180px] truncate">{container.Image}</DataTableCell>
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
										<DataTableCell>
											<div className="flex items-center justify-end gap-0.5">
												{isRunning ? (
													<>
														<form action={controlContainerAction}>
															<input type="hidden" name="containerId" value={container.ID} />
															<input type="hidden" name="action" value="stop" />
															<input type="hidden" name="environmentId" value={environment.id} />
															<FormSubmitButton
																label=""
																pendingLabel=""
																disabled={isProtected}
																variant="ghost"
																size="xs"
																title="Stop"
																className="h-7 w-7 p-0"
															>
																<Square className="h-3.5 w-3.5" />
															</FormSubmitButton>
														</form>
														<form action={controlContainerAction}>
															<input type="hidden" name="containerId" value={container.ID} />
															<input type="hidden" name="action" value="restart" />
															<input type="hidden" name="environmentId" value={environment.id} />
															<FormSubmitButton
																label=""
																pendingLabel=""
																disabled={isProtected}
																variant="ghost"
																size="xs"
																title="Restart"
																className="h-7 w-7 p-0"
															>
																<RefreshCw className="h-3.5 w-3.5" />
															</FormSubmitButton>
														</form>
													</>
												) : (
													<>
														<form action={controlContainerAction}>
															<input type="hidden" name="containerId" value={container.ID} />
															<input type="hidden" name="action" value="start" />
															<input type="hidden" name="environmentId" value={environment.id} />
															<FormSubmitButton
																label=""
																pendingLabel=""
																disabled={isProtected}
																variant="ghost"
																size="xs"
																title="Start"
																className="h-7 w-7 p-0"
															>
																<Play className="h-3.5 w-3.5" />
															</FormSubmitButton>
														</form>
														<DestructiveActionModal
															action={controlContainerAction}
															title={`Remove container ${container.Names}`}
															description="This permanently removes the container."
															triggerLabel=""
															confirmLabel="Remove"
															pendingLabel="Removing..."
															triggerVariant="ghost"
															triggerSize="xs"
															disabled={isProtected}
															hiddenFields={{
																containerId: container.ID,
																action: "remove",
																environmentId: environment.id,
															}}
															triggerClassName="h-7 w-7 p-0 text-muted hover:text-danger"
															triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
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
													variant="ghost"
													size="icon-xs"
													title="Shell"
												>
													<SquareTerminal className="h-3.5 w-3.5" />
												</LinkButton>
												<LinkButton
													href={`/dashboard/logs?mode=single&container=${container.ID}&environment=${environment.id}`}
													variant="ghost"
													size="icon-xs"
													title="Logs"
												>
													<LogsIcon className="h-3.5 w-3.5" />
												</LinkButton>
												<LinkButton
													href={`/dashboard/containers/${container.ID}?environment=${environment.id}`}
													variant="ghost"
													size="icon-xs"
													title="Details"
												>
													<ExternalLink className="h-3.5 w-3.5" />
												</LinkButton>
											</div>
										</DataTableCell>
									</DataTableRow>
								);
							})
						) : (
							<DataTableEmpty colSpan={6}>
								No containers matched the current filters.
							</DataTableEmpty>
						)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
