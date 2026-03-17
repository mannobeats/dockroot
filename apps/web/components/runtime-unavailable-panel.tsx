import { AlertTriangle, ExternalLink, RadioTower } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

export function RuntimeUnavailablePanel({
	title = "Runtime unavailable",
	message,
	className,
	showSettingsLink = true,
	showEnvironmentsLink = true,
}: {
	title?: string;
	message: string;
	className?: string;
	showSettingsLink?: boolean;
	showEnvironmentsLink?: boolean;
}) {
	return (
		<Panel
			className={cn("border-warning/20 bg-warning/[0.04] p-4 shadow-[var(--shadow-xs)]", className)}
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-warning">
						<AlertTriangle className="h-3.5 w-3.5" />
						Runtime State
					</div>
					<div className="mt-2 flex items-start gap-3">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
							<RadioTower className="h-4 w-4" />
						</div>
						<div className="min-w-0">
							<p className="text-sm font-semibold text-foreground">{title}</p>
							<p className="mt-1 text-xs leading-5 text-muted">{message}</p>
						</div>
					</div>
				</div>

				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{showEnvironmentsLink ? (
						<LinkButton href="/dashboard/environments" variant="outline" size="xs">
							Open environments
						</LinkButton>
					) : null}
					{showSettingsLink ? (
						<LinkButton href="/dashboard/settings" variant="ghost" size="xs">
							<ExternalLink className="h-3.5 w-3.5" />
							Review settings
						</LinkButton>
					) : null}
				</div>
			</div>
		</Panel>
	);
}
