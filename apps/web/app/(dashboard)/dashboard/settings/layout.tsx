"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const tabs = [
	{ href: "/dashboard/settings", label: "General" },
	{ href: "/dashboard/settings/github", label: "GitHub" },
] as const;

export default function SettingsLayout({ children }: { children: ReactNode }) {
	const pathname = usePathname();

	function isActive(href: string) {
		if (href === "/dashboard/settings") {
			return pathname === "/dashboard/settings";
		}
		return pathname.startsWith(href);
	}

	return (
		<div className="animate-in space-y-5">
			<div>
				<h1 className="text-lg font-bold tracking-tight">Settings</h1>
				<p className="mt-1 text-sm text-muted">Global manager configuration</p>
			</div>

			<div className="flex items-center gap-0.5 rounded-lg bg-foreground/[0.04] p-0.5 w-fit">
				{tabs.map((tab) => (
					<Link
						key={tab.href}
						href={tab.href}
						className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
							isActive(tab.href)
								? "bg-foreground text-background shadow-sm"
								: "text-muted hover:text-foreground"
						}`}
					>
						{tab.label}
					</Link>
				))}
			</div>

			{children}
		</div>
	);
}
