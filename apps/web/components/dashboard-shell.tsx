"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
	const [mobileOpen, setMobileOpen] = useState(false);

	return (
		<div className="flex min-h-screen bg-background">
			<Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
			<main className="flex min-w-0 flex-1 flex-col">
				<Topbar onMenuToggle={() => setMobileOpen((prev) => !prev)} />
				<div className="flex-1 overflow-auto p-4 lg:p-6">
					<div className="mx-auto max-w-7xl">{children}</div>
				</div>
			</main>
		</div>
	);
}
