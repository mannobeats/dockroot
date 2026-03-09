"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";

interface TopbarProps {
	onMenuToggle?: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
	return (
		<header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b border-default/8 bg-surface/80 px-4 backdrop-blur-xl backdrop-saturate-150 md:px-6">
			<div className="flex items-center gap-3">
				<Button
					aria-label="Toggle sidebar"
					onClick={onMenuToggle}
					variant="ghost"
					size="icon"
					className="rounded-xl md:hidden"
				>
					<Menu className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex items-center gap-1.5">
				<ThemeToggle />
			</div>
		</header>
	);
}
