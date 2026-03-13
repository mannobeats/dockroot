import { updateGlobalSettingsAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { getGlobalSettings } from "@/lib/platform";

export default async function SettingsPage() {
	const { userId } = await requirePrivilegedPageSession();

	const settings = await getGlobalSettings(userId);

	return (
		<div className="animate-in space-y-5">
			<PageHeader title="Settings" description="Global manager configuration" />

			<Panel padding="md">
				<form action={updateGlobalSettingsAction} className="space-y-3">
					<p className="text-sm font-semibold">Manager URL</p>
					<p className="text-xs text-muted">
						Used for runtime links and remote agent callbacks.
					</p>
					<Field>
						<FieldLabel htmlFor="managerUrl">Public manager URL</FieldLabel>
						<Input
							id="managerUrl"
							name="managerUrl"
							type="url"
							defaultValue={settings.managerUrl}
							placeholder="https://your-domain.com"
							required
						/>
						<FieldHint>
							Use an IP or URL reachable by your browser and agents.
						</FieldHint>
					</Field>
					<FormSubmitButton label="Save" pendingLabel="Saving..." size="sm" />
				</form>
			</Panel>

			<div className="grid gap-3 sm:grid-cols-2">
				<MetricCard
					label="Data Directory"
					value={settings.dataDir}
					description="Compose payloads and runtime artifacts"
					valueClassName="break-all text-sm"
				/>
				<MetricCard
					label="Manager URL"
					value={settings.managerUrl}
					description="Used by remote agents"
					valueClassName="break-all text-sm"
				/>
				<MetricCard
					label="Stacks"
					value={String(settings.stacks)}
					description="Tracked by Dockroot"
				/>
				<MetricCard
					label="Environments"
					value={String(settings.environments)}
					description="Local and remote"
				/>
			</div>
		</div>
	);
}
