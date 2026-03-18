import {
	Activity,
	Boxes,
	Cpu,
	HardDrive,
	Layers3,
	LayoutDashboard,
	Logs,
	Network,
	Server,
	Settings,
	SquareTerminal,
	TimerReset,
} from "lucide-react";
import type { NavGroup, NavItem } from "./types";

export const SIDEBAR_NAV_ITEMS: NavItem[] = [
	{ href: "/dashboard", label: "Overview", icon: LayoutDashboard, group: "main" },
	{ href: "/dashboard/stacks", label: "Stacks", icon: Layers3, group: "main" },
	{ href: "/dashboard/environments", label: "Environments", icon: Server, group: "main" },
	{ href: "/dashboard/containers", label: "Containers", icon: Cpu, group: "runtime" },
	{ href: "/dashboard/shell", label: "Shell", icon: SquareTerminal, group: "runtime" },
	{ href: "/dashboard/logs", label: "Logs", icon: Logs, group: "runtime" },
	{ href: "/dashboard/images", label: "Images", icon: Boxes, group: "resources", privileged: true },
	{
		href: "/dashboard/volumes",
		label: "Volumes",
		icon: HardDrive,
		group: "resources",
		privileged: true,
	},
	{
		href: "/dashboard/networks",
		label: "Networks",
		icon: Network,
		group: "resources",
		privileged: true,
	},
	{ href: "/dashboard/activity", label: "Activity", icon: Activity, group: "ops" },
	{ href: "/dashboard/schedules", label: "Schedules", icon: TimerReset, group: "ops" },
	{
		href: "/dashboard/settings",
		label: "Settings",
		icon: Settings,
		group: "admin",
		privileged: true,
	},
];

export const SIDEBAR_GROUP_LABELS: Record<NavGroup, string> = {
	main: "",
	runtime: "Runtime",
	resources: "Resources",
	ops: "Operations",
	admin: "",
};
