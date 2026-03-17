import { headers } from "next/headers";
import { updateGlobalSettingsAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Alert } from "@/components/ui/alert";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { inferRequestManagerUrl, isLoopbackHostname, resolveManagerUrl } from "@/lib/manager-url";
import { getGlobalSettings } from "@/lib/platform";

export default async function SettingsPage() {
	const { userId } = await requirePrivilegedPageSession();
	const requestHeaders = await headers();
	const settings = await getGlobalSettings(userId);
	const detectedManagerUrl = inferRequestManagerUrl(requestHeaders);
	const resolvedManagerUrl = resolveManagerUrl({
		configuredUrl: settings.managerUrl,
		requestManagerUrl: detectedManagerUrl,
	});
	const usingAutoDetectedAddress = (() => {
		try {
			return (
				isLoopbackHostname(new URL(settings.managerUrl).hostname) && detectedManagerUrl != null
			);
		} catch {
			return false;
		}
	})();

	return (
		<div className="space-y-5">
			<Panel padding="md">
				<form action={updateGlobalSettingsAction} className="space-y-3">
					<p className="text-sm font-semibold">Manager URL</p>
					<p className="text-xs text-muted">Used for runtime links and remote agent callbacks.</p>
					<Field>
						<FieldLabel htmlFor="managerUrl">Public manager URL</FieldLabel>
						<Input
							id="managerUrl"
							name="managerUrl"
							type="url"
							defaultValue={resolvedManagerUrl}
							placeholder="https://your-domain.com"
							required
						/>
						<FieldHint>Use an IP or URL reachable by your browser and agents.</FieldHint>
					</Field>
					{usingAutoDetectedAddress ? (
						<Alert variant="info">
							Local loopback was replaced with the detected server address so agent install commands
							work outside this machine.
						</Alert>
					) : null}
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
					value={resolvedManagerUrl}
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
