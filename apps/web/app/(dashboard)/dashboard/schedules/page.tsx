import {
	runContainerUpdateApplyNowAction,
	runContainerUpdateCheckNowAction,
	updateContainerUpdateScheduleAction,
} from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
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
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import {
	getOrCreateContainerUpdateSchedule,
	listContainerUpdateRuns,
} from "@/lib/container-updates";
import { listEnvironments } from "@/lib/platform";

export default async function SchedulesPage({
	searchParams,
}: {
	searchParams: Promise<{ environment?: string }>;
}) {
	const { userId } = await requirePrivilegedPageSession();
	const params = await searchParams;
	const environments = await listEnvironments(userId);
	const selectedEnvironmentId =
		params.environment && environments.some((environment) => environment.id === params.environment)
			? params.environment
			: environments[0]?.id;

	if (!selectedEnvironmentId) {
		return (
			<div className="animate-in space-y-5">
				<PageHeader title="Schedules" description="Recurring container update automation" />
				<Panel className="p-8 text-center text-sm text-muted">No environments are available.</Panel>
			</div>
		);
	}

	const selectedEnvironment = environments.find(
		(environment) => environment.id === selectedEnvironmentId,
	);
	const schedule = await getOrCreateContainerUpdateSchedule(userId, selectedEnvironmentId);
	const runs = await listContainerUpdateRuns({
		userId,
		environmentId: selectedEnvironmentId,
		limit: 20,
	});

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Schedules"
				description={`${selectedEnvironment?.name || "Environment"} · recurring update checks and deployments`}
				actions={
					<div className="flex items-center gap-2">
						<form action={runContainerUpdateCheckNowAction}>
							<input type="hidden" name="environmentId" value={selectedEnvironmentId} />
							<FormSubmitButton
								label="Check now"
								pendingLabel="Checking..."
								size="xs"
								variant="outline"
							/>
						</form>
						<form action={runContainerUpdateApplyNowAction}>
							<input type="hidden" name="environmentId" value={selectedEnvironmentId} />
							<FormSubmitButton label="Update now" pendingLabel="Queueing..." size="xs" />
						</form>
					</div>
				}
			/>

			<Panel padding="md">
				<form className="mb-4 flex items-end gap-2" method="GET">
					<Field className="w-72">
						<FieldLabel htmlFor="environment">Environment</FieldLabel>
						<Select id="environment" name="environment" defaultValue={selectedEnvironmentId}>
							{environments.map((environment) => (
								<option key={environment.id} value={environment.id}>
									{environment.name} ({environment.kind})
								</option>
							))}
						</Select>
					</Field>
					<FormSubmitButton
						label="Switch"
						pendingLabel="Switching..."
						size="sm"
						variant="secondary"
					/>
				</form>

				<form action={updateContainerUpdateScheduleAction} className="space-y-4">
					<input type="hidden" name="environmentId" value={selectedEnvironmentId} />

					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<Field>
							<FieldLabel htmlFor="checkMode">Check mode</FieldLabel>
							<Select id="checkMode" name="checkMode" defaultValue={schedule.checkMode}>
								<option value="same_tag">Same tag only</option>
								<option value="include_major">Include newer major</option>
							</Select>
							<FieldHint>
								Major checks surface recommendations, but auto-update still only applies same-tag
								updates.
							</FieldHint>
						</Field>
						<Field>
							<FieldLabel htmlFor="autoCheckEnabled">Auto check</FieldLabel>
							<Select
								id="autoCheckEnabled"
								name="autoCheckEnabled"
								defaultValue={String(schedule.autoCheckEnabled)}
							>
								<option value="true">Enabled</option>
								<option value="false">Disabled</option>
							</Select>
							<FieldHint>Run periodic update checks for opted-in containers.</FieldHint>
						</Field>
						<Field>
							<FieldLabel htmlFor="checkIntervalMinutes">Check interval (minutes)</FieldLabel>
							<Input
								id="checkIntervalMinutes"
								name="checkIntervalMinutes"
								type="number"
								min={5}
								max={1440}
								defaultValue={String(schedule.checkIntervalMinutes)}
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="autoUpdateEnabled">Auto update</FieldLabel>
							<Select
								id="autoUpdateEnabled"
								name="autoUpdateEnabled"
								defaultValue={String(schedule.autoUpdateEnabled)}
							>
								<option value="true">Enabled</option>
								<option value="false">Disabled</option>
							</Select>
							<FieldHint>Queue stack redeploys for containers with updates available.</FieldHint>
						</Field>
						<Field>
							<FieldLabel htmlFor="updateIntervalMinutes">Update interval (minutes)</FieldLabel>
							<Input
								id="updateIntervalMinutes"
								name="updateIntervalMinutes"
								type="number"
								min={5}
								max={1440}
								defaultValue={String(schedule.updateIntervalMinutes)}
								required
							/>
						</Field>
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="pullBeforeCheck">Pull image before check</FieldLabel>
							<Select
								id="pullBeforeCheck"
								name="pullBeforeCheck"
								defaultValue={String(schedule.pullBeforeCheck)}
							>
								<option value="true">Enabled</option>
								<option value="false">Disabled</option>
							</Select>
							<FieldHint>
								Ensures checks compare against the newest registry image metadata.
							</FieldHint>
						</Field>
						<Field>
							<FieldLabel htmlFor="updateOnlyRunning">Update only running containers</FieldLabel>
							<Select
								id="updateOnlyRunning"
								name="updateOnlyRunning"
								defaultValue={String(schedule.updateOnlyRunning)}
							>
								<option value="true">Enabled</option>
								<option value="false">Disabled</option>
							</Select>
							<FieldHint>Prevents scheduling updates for stopped workloads.</FieldHint>
						</Field>
					</div>

					<div className="flex items-center gap-2">
						<FormSubmitButton label="Save schedule" pendingLabel="Saving..." size="sm" />
						{schedule.lastCheckAt ? (
							<Badge variant="default">Last check {schedule.lastCheckAt.toLocaleString()}</Badge>
						) : null}
						{schedule.lastUpdateAt ? (
							<Badge variant="default">Last update {schedule.lastUpdateAt.toLocaleString()}</Badge>
						) : null}
					</div>
				</form>
			</Panel>

			<Panel>
				<div className="border-b border-default/8 px-4 py-3">
					<p className="text-sm font-semibold">Recent runs</p>
					<p className="text-xs text-muted">Check and update executions for this environment.</p>
				</div>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Started</DataTableHead>
							<DataTableHead>Type</DataTableHead>
							<DataTableHead>Status</DataTableHead>
							<DataTableHead>Totals</DataTableHead>
							<DataTableHead>Summary</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{runs.length ? (
							runs.map((run) => (
								<DataTableRow key={run.id}>
									<DataTableCell className="text-xs text-muted">
										{run.startedAt.toLocaleString()}
									</DataTableCell>
									<DataTableCell>
										<Badge variant="default">{run.runType}</Badge>
									</DataTableCell>
									<DataTableCell>
										<Badge
											variant={
												run.status === "failed"
													? "danger"
													: run.status === "running"
														? "warning"
														: "success"
											}
										>
											{run.status}
										</Badge>
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{run.totalContainers} containers · {run.queuedStacks} stacks queued ·{" "}
										{run.failedContainers} failed
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{run.summary || (run.error ? `Error: ${run.error}` : "—")}
									</DataTableCell>
								</DataTableRow>
							))
						) : (
							<DataTableEmpty colSpan={5}>No schedule runs yet.</DataTableEmpty>
						)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
