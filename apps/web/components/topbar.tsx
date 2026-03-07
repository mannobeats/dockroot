"use client";

import { Bell, Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

interface TopbarProps {
	onMenuToggle?: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
	return (
		<header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-default/15 bg-background/80 px-4 backdrop-blur-xl md:px-6">
			<div className="flex items-center gap-3">
				<button
					type="button"
					aria-label="Toggle sidebar"
					onClick={onMenuToggle}
					className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-default/15 bg-surface text-muted transition-colors hover:text-foreground md:hidden"
				>
					<Menu className="h-5 w-5" />
				</button>
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
						Dockroot Manager
					</p>
					<p className="text-sm text-foreground/80">Compose-native deployment control plane</p>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<button
					type="button"
					className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-default/15 bg-surface text-muted transition-colors hover:text-foreground"
				>
					<Bell className="h-4 w-4" />
				</button>
				<ThemeToggle />
			</div>
		</header>
	);
}
