"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

interface TopbarProps {
	onMenuToggle?: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
	return (
		<header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-default/20 bg-background/80 px-4 md:px-6 backdrop-blur-xl">
			<button
				type="button"
				aria-label="Toggle sidebar"
				onClick={onMenuToggle}
				className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-default/40 hover:text-foreground transition-colors md:hidden"
			>
				<Menu className="h-5 w-5" />
			</button>
			<div className="ml-auto">
				<ThemeToggle />
			</div>
		</header>
	);
}
