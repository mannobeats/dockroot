"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";

interface TopbarProps {
	onMenuToggle?: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
	return (
		<header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-default/8 bg-surface/80 px-3 backdrop-blur-xl backdrop-saturate-150 md:px-4">
			<div className="flex items-center gap-2">
				<Button
					aria-label="Toggle sidebar"
					onClick={onMenuToggle}
					variant="ghost"
					size="icon-sm"
					className="rounded-lg md:hidden"
				>
					<Menu className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex items-center gap-1">
				<ThemeToggle />
			</div>
		</header>
	);
}
