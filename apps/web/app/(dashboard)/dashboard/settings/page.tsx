import { FolderKanban, HardDrive, Server, ShieldCheck } from "lucide-react";
import { updateGlobalSettingsAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { requirePrivilegedPageSession } from "@/lib/authorization";
import { getGlobalSettings } from "@/lib/platform";

export default async function SettingsPage() {
	const { userId } = await requirePrivilegedPageSession();

	const settings = await getGlobalSettings(userId);

	const cards = [
		{
			title: "Manager URL",
			value: settings.managerUrl,
			detail: "Used by remote agents to poll for deployments.",
			icon: ShieldCheck,
		},
		{
			title: "Data Directory",
			value: settings.dataDir,
			detail: "Compose payloads and runtime artifacts.",
			icon: HardDrive,
		},
		{
			title: "Projects",
			value: String(settings.projects),
			detail: "Configured in the manager.",
			icon: FolderKanban,
		},
		{
			title: "Environments",
			value: String(settings.environments),
			detail: "Local and remote.",
			icon: Server,
		},
	];

	return (
		<div className="animate-in space-y-6">
			<PageHeader kicker="Admin" title="Settings" description="Global manager configuration" />
			<Panel padding="md">
				<form action={updateGlobalSettingsAction} className="space-y-4">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/[0.04]">
							<ShieldCheck className="h-4 w-4 text-muted" />
						</div>
						<div>
							<p className="text-sm font-semibold">Manager URL</p>
							<p className="text-xs text-muted">
								Used for runtime links and remote agent callbacks.
							</p>
						</div>
					</div>
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
							Use an IP or URL reachable by your browser and agents. Example:{" "}
							https://dockroot.example.com
						</FieldHint>
					</Field>
					<FormSubmitButton label="Save URL" pendingLabel="Saving..." size="sm" />
				</form>
			</Panel>
			<div className="grid gap-4 sm:grid-cols-2">
				{cards.map((card) => (
					<Panel key={card.title} padding="md" className="transition-all hover:border-default/20">
						<div className="flex items-center gap-3">
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/[0.04]">
								<card.icon className="h-4 w-4 text-muted" />
							</div>
							<div>
								<p className="text-sm font-semibold">{card.title}</p>
								<p className="text-xs text-muted">{card.detail}</p>
							</div>
						</div>
						<p className="mt-4 break-all text-sm font-medium">{card.value}</p>
					</Panel>
				))}
			</div>
		</div>
	);
}
