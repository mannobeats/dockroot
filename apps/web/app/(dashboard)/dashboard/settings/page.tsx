import { FolderKanban, HardDrive, Server, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requirePrivilegedSession } from "@/lib/authorization";
import { getGlobalSettings } from "@/lib/platform";

export default async function SettingsPage() {
	const { userId } = await requirePrivilegedSession();

	const settings = await getGlobalSettings(userId);

	const cards = [
		{
			title: "Manager URL",
			value: settings.managerUrl,
			detail: "Used by remote agents to poll for deployments and heartbeat updates.",
			icon: ShieldCheck,
		},
		{
			title: "Data Directory",
			value: settings.dataDir,
			detail: "Compose payloads and runtime artifacts are stored here.",
			icon: HardDrive,
		},
		{
			title: "Projects",
			value: String(settings.projects),
			detail: "Projects currently configured in the manager.",
			icon: FolderKanban,
		},
		{
			title: "Environments",
			value: String(settings.environments),
			detail: "Local and remote environments registered with the control plane.",
			icon: Server,
		},
	];

	return (
		<div className="space-y-6">
			<PageHeader
				kicker="Administration"
				title="Settings"
				description="Global manager values and operational defaults for this instance."
			/>
			<div className="grid gap-4 md:grid-cols-2">
				{cards.map((card) => (
					<div
						key={card.title}
						className="rounded-[28px] border border-default/15 bg-surface/80 p-5"
					>
						<div className="flex items-center gap-3">
							<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
								<card.icon className="h-5 w-5" />
							</div>
							<div>
								<p className="text-sm font-semibold">{card.title}</p>
								<p className="text-xs text-muted">{card.detail}</p>
							</div>
						</div>
						<p className="mt-5 break-all text-sm font-medium">{card.value}</p>
					</div>
				))}
			</div>
		</div>
	);
}
