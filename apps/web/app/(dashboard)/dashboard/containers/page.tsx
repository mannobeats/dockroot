import { Lock } from "lucide-react";
import Link from "next/link";
import { controlContainerAction } from "@/app/(dashboard)/actions";
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
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { resolveRuntimeEnvironment } from "@/lib/environment-runtime";
import { listAccessibleContainersForUser } from "@/lib/runtime-access";
import { getProtectedContainerLabel, isProtectedManagerContainer } from "@/lib/runtime-protection";

export default async function ContainersPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; status?: string; environment?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const params = await searchParams;
	const environment = await resolveRuntimeEnvironment(userId, params.environment);
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

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Runtime"
				title="Containers"
				description={`${environment.name} — ${filtered.length} containers, ${runningCount} running`}
			/>

			{includeRuntime ? <LiveRuntimePanel /> : null}

			{/* Stats */}
			<div className="grid gap-4 sm:grid-cols-3">
				<MetricCard label="Total" value={filtered.length} />
				<MetricCard label="Running" value={runningCount} valueClassName="text-success" />
				<MetricCard label="Published ports" value={publishedCount} />
			</div>

			{/* Filter */}
			<Panel padding="sm">
				<form className="flex flex-col gap-3 sm:flex-row">
					<Input type="search" name="q" defaultValue={params.q || ""} placeholder="Search containers..." className="flex-1" />
					<Select name="status" defaultValue={status}>
						<option value="all">All statuses</option>
						<option value="running">Running</option>
						<option value="exited">Exited</option>
						<option value="created">Created</option>
						<option value="paused">Paused</option>
					</Select>
					<Button type="submit">
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
							<DataTableHead>Image</DataTableHead>
							<DataTableHead>State</DataTableHead>
							<DataTableHead>Status</DataTableHead>
							<DataTableHead>Ports</DataTableHead>
							<DataTableHead>Size</DataTableHead>
							<DataTableHead>Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
							{filtered.length ? (
								filtered.map((container: Record<string, string>) => {
									const isProtected =
										environment.kind === "local" && isProtectedManagerContainer(container);
									const protectedLabel =
										environment.kind === "local" ? getProtectedContainerLabel(container) : "";

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
													{container.Labels?.includes("com.docker.compose.project=") ? (
														<p className="text-xs text-muted">
															{container.Labels.split(",")
																.find((label) => label.startsWith("com.docker.compose.project="))
																?.split("=")
																.slice(1)
																.join("=")}
														</p>
													) : null}
												</div>
											</DataTableCell>
											<DataTableCell className="text-xs text-muted">{container.Image}</DataTableCell>
											<DataTableCell>
												<StatusBadge status={(container.State || "offline").toLowerCase()} />
											</DataTableCell>
											<DataTableCell className="text-xs text-muted">{container.Status || "—"}</DataTableCell>
											<DataTableCell>
												<RuntimePortLinks ports={container.Ports} compact />
											</DataTableCell>
											<DataTableCell className="text-xs text-muted">{container.Size || "—"}</DataTableCell>
											<DataTableCell>
												<div className="flex flex-wrap gap-1.5">
													<LinkButton
														href={`/dashboard/containers/${container.ID}?environment=${environment.id}`}
														size="xs"
													>
														Open
													</LinkButton>
													{(["start", "stop", "restart", "remove"] as const).map((action) => (
														<form key={action} action={controlContainerAction}>
															<input type="hidden" name="containerId" value={container.ID} />
															<input type="hidden" name="action" value={action} />
															<input type="hidden" name="environmentId" value={environment.id} />
															<FormSubmitButton
																label={action}
																pendingLabel={`${action}ing...`}
																disabled={isProtected}
																title={isProtected ? "Protected container" : undefined}
																variant="outline"
																size="xs"
															/>
														</form>
													))}
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
								<DataTableEmpty colSpan={7}>No containers matched the current filters.</DataTableEmpty>
							)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
