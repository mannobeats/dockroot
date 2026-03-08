import Link from "next/link";
import {
	adoptComposeProjectAction,
	controlComposeProjectAction,
	deployStackAction,
	destroyStackAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
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
import { Panel } from "@/components/ui/panel";
import { isPrivilegedRole, requireUserSession } from "@/lib/authorization";
import { listStacks } from "@/lib/platform";

export default async function StacksPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const { userId, role } = await requireUserSession();
	const includeUntracked = isPrivilegedRole(role);

	const query = await searchParams;
	const search = (query.q || "").trim().toLowerCase();
	const stacks = await listStacks(userId, { includeUntracked });
	const filtered = search
		? stacks.filter((stack) =>
				[stack.name, stack.slug, stack.projectName || "", stack.environmentName || ""]
					.join(" ")
					.toLowerCase()
					.includes(search),
			)
		: stacks;

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Operations"
				title="Stacks"
				description={`${filtered.length} compose stacks across all environments`}
			/>

			{/* Search */}
			<Panel padding="sm">
				<form className="flex flex-col gap-3 sm:flex-row">
					<Input type="search" name="q" defaultValue={query.q || ""} placeholder="Search stacks, projects, environments..." className="flex-1" />
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
							<DataTableHead>Project</DataTableHead>
							<DataTableHead>Environment</DataTableHead>
							<DataTableHead>Containers</DataTableHead>
							<DataTableHead>Status</DataTableHead>
							<DataTableHead>Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
							{filtered.length ? (
								filtered.map((stack) => (
									<DataTableRow
										key={`${stack.type}-${stack.slug}`}
										className="group"
									>
										<DataTableCell>
											<div className="space-y-0.5">
												<div className="flex items-center gap-2">
													<p className="font-medium">{stack.name}</p>
													<StatusBadge
														status={
															stack.type === "tracked" ? stack.status : stack.status.split("(")[0]
														}
													/>
												</div>
												<p className="text-xs text-muted">{stack.slug}</p>
											</div>
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">
											{stack.type === "tracked" ? "Internal" : "Untracked"}
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">{stack.projectName || "—"}</DataTableCell>
										<DataTableCell className="text-xs text-muted">{stack.environmentName || "—"}</DataTableCell>
										<DataTableCell>
											<div className="space-y-0.5">
												<p className="text-sm font-medium">
													{stack.runningCount}/{stack.containerCount}
												</p>
												<p className="text-xs text-muted">
													{stack.containers
														.slice(0, 2)
														.map((c) => c.Names)
														.join(", ") || "—"}
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
															<FormSubmitButton label="Deploy" pendingLabel="Deploying..." size="xs" />
														</form>
														<form action={destroyStackAction}>
															<input type="hidden" name="stackId" value={stack.stackId || ""} />
															<FormSubmitButton label="Destroy" pendingLabel="Destroying..." variant="danger" size="xs" />
														</form>
														<LinkButton
															href={`/dashboard/projects/${stack.projectId}/stacks/${stack.stackId}`}
															variant="outline"
															size="xs"
														>
															Open
														</LinkButton>
													</>
												) : includeUntracked ? (
													(["start", "stop", "restart", "destroy"] as const).map((action) => (
														<form key={action} action={controlComposeProjectAction}>
															<input type="hidden" name="projectName" value={stack.slug} />
															<input type="hidden" name="action" value={action} />
															{stack.configFiles.map((configFile) => (
																<input
																	key={configFile}
																	type="hidden"
																	name="configFiles"
																	value={configFile}
																/>
															))}
															<FormSubmitButton
																label={action}
																pendingLabel={`${action}ing...`}
																variant="outline"
																size="xs"
															/>
														</form>
													))
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
														<FormSubmitButton
															label="Adopt"
															pendingLabel="Adopting..."
															size="xs"
														/>
													</form>
												) : null}
											</div>
										</DataTableCell>
									</DataTableRow>
								))
							) : (
								<DataTableEmpty colSpan={7}>No stacks found.</DataTableEmpty>
							)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
