import type { LucideIcon } from "lucide-react";

export interface SidebarEnvironment {
	id: string;
	name: string;
	kind: string;
}

export interface SidebarProps {
	environments?: SidebarEnvironment[];
	defaultEnvironmentId?: string;
	mobileOpen?: boolean;
	onMobileClose?: () => void;
}

export type NavGroup = "main" | "runtime" | "resources" | "ops" | "admin";

export interface NavItem {
	href: string;
	label: string;
	icon: LucideIcon;
	group: NavGroup;
	privileged?: boolean;
}

export interface SidebarNavSection {
	group: NavGroup;
	items: NavItem[];
}
