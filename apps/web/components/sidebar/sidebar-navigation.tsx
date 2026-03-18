import Link from "next/link";
import { SIDEBAR_GROUP_LABELS } from "./constants";
import type { SidebarNavSection } from "./types";

interface SidebarNavigationProps {
	collapsed: boolean;
	pathname: string;
	sections: SidebarNavSection[];
	selectedEnvironmentId: string;
}

export function SidebarNavigation({
	collapsed,
	pathname,
	sections,
	selectedEnvironmentId,
}: SidebarNavigationProps) {
	return (
		<nav className={`mt-2 flex-1 overflow-y-auto ${collapsed ? "px-1" : "px-2"}`}>
			{sections.map((section, index) => (
				<div key={section.group} className={index > 0 ? "mt-3 border-t border-default/6 pt-3" : ""}>
					{!collapsed && SIDEBAR_GROUP_LABELS[section.group] ? (
						<p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/50">
							{SIDEBAR_GROUP_LABELS[section.group]}
						</p>
					) : null}

					<div className="space-y-px">
						{section.items.map((item) => {
							const isActive =
								pathname === item.href ||
								(item.href !== "/dashboard" && pathname.startsWith(item.href));

							const linkHref =
								selectedEnvironmentId && item.href !== "/dashboard/environments"
									? `${item.href}?environment=${selectedEnvironmentId}`
									: item.href;

							return (
								<Link
									key={item.href}
									href={linkHref}
									title={collapsed ? item.label : undefined}
									className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
										collapsed ? "justify-center" : ""
									} ${
										isActive
											? "bg-foreground/[0.06] text-foreground"
											: "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
									}`}
								>
									<item.icon
										className={`h-4 w-4 shrink-0 ${
											isActive ? "text-foreground" : "text-muted/70 group-hover:text-foreground"
										}`}
									/>
									{collapsed ? null : <span>{item.label}</span>}
								</Link>
							);
						})}
					</div>
				</div>
			))}
		</nav>
	);
}
