import { updateContainerUpdateScheduleAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";

export function ScheduleConfigurationPanel({
	environmentId,
	schedule,
}: {
	environmentId: string;
	schedule: {
		checkMode: string;
		autoCheckEnabled: boolean;
		autoUpdateEnabled: boolean;
		checkIntervalMinutes: number;
		updateIntervalMinutes: number;
		pullBeforeCheck: boolean;
		updateOnlyRunning: boolean;
		lastCheckAt: Date | null;
		lastUpdateAt: Date | null;
	};
}) {
	return (
		<Panel>
			<div className="border-b border-default/8 px-4 py-3">
				<p className="text-sm font-semibold tracking-tight">Configuration</p>
				<p className="mt-0.5 text-xs text-muted">
					Manage automated check and update behavior for this environment.
				</p>
			</div>
			<div className="p-4">
				<form action={updateContainerUpdateScheduleAction} className="space-y-5">
					<input type="hidden" name="environmentId" value={environmentId} />

					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
					</div>

					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

					<div className="flex items-center gap-2 border-t border-default/8 pt-4">
						<FormSubmitButton label="Save schedule" pendingLabel="Saving..." size="sm" />
						{schedule.lastCheckAt ? (
							<Badge variant="default">Last check {schedule.lastCheckAt.toLocaleString()}</Badge>
						) : null}
						{schedule.lastUpdateAt ? (
							<Badge variant="default">Last update {schedule.lastUpdateAt.toLocaleString()}</Badge>
						) : null}
					</div>
				</form>
			</div>
		</Panel>
	);
}
