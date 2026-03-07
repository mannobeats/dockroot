"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
	const [mobileOpen, setMobileOpen] = useState(false);

	return (
		<div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_24%),linear-gradient(180deg,#040814,#09090b_18%,var(--background)_45%)]">
			<Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
			<main className="flex min-w-0 flex-1 flex-col">
				<Topbar onMenuToggle={() => setMobileOpen((prev) => !prev)} />
				<div className="flex-1 overflow-auto p-4 lg:p-6">
					<div className="mx-auto max-w-[1520px]">{children}</div>
				</div>
			</main>
		</div>
	);
}
