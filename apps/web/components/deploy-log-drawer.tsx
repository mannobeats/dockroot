"use client";

import { ExternalLink, X } from "lucide-react";
import { useCallback, useEffect } from "react";
import { LiveStackFeed } from "@/components/live-stack-feed";
import { LinkButton } from "@/components/ui/link-button";

export function DeployLogDrawer({
	stackId,
	stackName,
	initialLog,
	open,
	onClose,
}: {
	stackId: string;
	stackName?: string;
	initialLog?: string | null;
	open: boolean;
	onClose: () => void;
}) {
	const handleClose = useCallback(() => {
		onClose();
	}, [onClose]);

	useEffect(() => {
		if (!open) return;

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				handleClose();
			}
		}

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, handleClose]);

	if (!open) return null;

	return (
		<div className="fixed inset-y-4 right-4 z-40 w-[min(44rem,92vw)] max-w-xl rounded-xl border border-default/12 bg-surface/95 shadow-[var(--shadow-lg)] backdrop-blur-sm animate-in">
			{/* Header — matches the existing Live Deploy Console pattern */}
			<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
				<div className="min-w-0">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted/75">
						Live Deploy Console
					</p>
					{stackName ? (
						<p className="truncate text-sm font-medium">{stackName}</p>
					) : null}
				</div>
				<div className="flex items-center gap-1.5">
					<LinkButton
						href={`/dashboard/stacks/${stackId}`}
						variant="ghost"
						size="icon-xs"
						title="Open stack workspace"
					>
						<ExternalLink className="h-3.5 w-3.5" />
					</LinkButton>
					<button
						type="button"
						onClick={handleClose}
						className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
						aria-label="Close deploy console"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			{/* Body */}
			<div className="p-3">
				<LiveStackFeed
					stackId={stackId}
					initialLog={initialLog}
					height="min(72vh, 760px)"
				/>
			</div>
		</div>
	);
}
