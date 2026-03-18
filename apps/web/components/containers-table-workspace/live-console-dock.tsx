"use client";

import { TerminalSquare, X } from "lucide-react";
import { LiveStackFeed } from "@/components/live-stack-feed";
import { LinkButton } from "@/components/ui/link-button";

export function ContainersLiveConsoleDock({
	environmentId,
	watchStackId,
	onClose,
}: {
	environmentId: string;
	watchStackId: string;
	onClose: () => void;
}) {
	return (
		<div className="fixed inset-y-4 right-4 z-40 w-[min(44rem,92vw)] max-w-xl rounded-xl border border-default/12 bg-surface/95 shadow-[var(--shadow-lg)] backdrop-blur-sm">
			<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
				<div className="min-w-0">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted/75">
						Live Deploy Console
					</p>
					<p className="truncate text-sm font-medium">Queued stack: {watchStackId}</p>
				</div>
				<div className="flex items-center gap-1.5">
					<LinkButton
						href={`/dashboard/stacks?environment=${environmentId}&watchStackId=${watchStackId}`}
						variant="ghost"
						size="icon-xs"
						title="Open stacks workspace"
					>
						<TerminalSquare className="h-3.5 w-3.5" />
					</LinkButton>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
						aria-label="Close deploy console"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>
			<div className="p-3">
				<LiveStackFeed stackId={watchStackId} height="min(72vh, 760px)" />
			</div>
		</div>
	);
}
