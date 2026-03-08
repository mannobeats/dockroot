"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

interface TopbarProps {
	onMenuToggle?: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
	return (
		<header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-default/10 bg-background/80 px-4 backdrop-blur-xl md:px-6">
			<div className="flex items-center gap-3">
				<button
					type="button"
					aria-label="Toggle sidebar"
					onClick={onMenuToggle}
					className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground md:hidden"
				>
					<Menu className="h-4 w-4" />
				</button>
			</div>

			<div className="flex items-center gap-1">
				<ThemeToggle />
			</div>
		</header>
	);
}
