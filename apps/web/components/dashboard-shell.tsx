"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export function DashboardShell({
	children,
	environments,
	defaultEnvironmentId,
}: {
	children: React.ReactNode;
	environments: Array<{ id: string; name: string; kind: string }>;
	defaultEnvironmentId?: string;
}) {
	const [mobileOpen, setMobileOpen] = useState(false);

	return (
		<div className="flex h-screen overflow-hidden bg-background">
			<Sidebar
				environments={environments}
				defaultEnvironmentId={defaultEnvironmentId}
				mobileOpen={mobileOpen}
				onMobileClose={() => setMobileOpen(false)}
			/>
			<main className="flex min-w-0 flex-1 flex-col">
				<Topbar onMenuToggle={() => setMobileOpen((prev) => !prev)} />
				<div className="flex-1 overflow-auto p-4 lg:p-6">
					<div className="mx-auto max-w-[1400px]">{children}</div>
				</div>
			</main>
		</div>
	);
}
