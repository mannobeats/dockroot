import { FolderKanban, HardDrive, Server, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
