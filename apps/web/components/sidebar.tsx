"use client";

import {
	Activity,
	Boxes,
	ChevronLeft,
	ChevronRight,
	Cpu,
	FolderKanban,
	HardDrive,
	Layers3,
	LayoutDashboard,
	LogOut,
	Logs,
	Network,
	Search,
	Server,
	Settings,
	SquareTerminal,
	TimerReset,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EnvironmentSwitcher } from "@/components/environment-switcher";
import { signOut, useSession } from "@/lib/auth-client";

const navItems = [
	{ href: "/dashboard", label: "Overview", icon: LayoutDashboard, group: "main" },
	{ href: "/dashboard/projects", label: "Projects", icon: FolderKanban, group: "main" },
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

interface SidebarProps {
	environments: Array<{ id: string; name: string; kind: string }>;
	defaultEnvironmentId?: string;
	mobileOpen?: boolean;
	onMobileClose?: () => void;
}

export function Sidebar({
	environments,
	defaultEnvironmentId,
	mobileOpen = false,
	onMobileClose,
}: SidebarProps) {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { data: session } = useSession();
	const role = session?.user && "role" in session.user ? session.user.role : undefined;
	const isPrivileged = role === "owner" || role === "admin";
	const [collapsed, setCollapsed] = useState(false);
	const [mounted, setMounted] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const selectedEnvironmentId = searchParams.get("environment") || defaultEnvironmentId || "";

	useEffect(() => {
		const saved = localStorage.getItem("dockroot-sidebar-collapsed");
		if (saved) {
			setCollapsed(saved === "true");
		}
		setMounted(true);
	}, []);

	useEffect(() => {
		if (mounted) {
			localStorage.setItem("dockroot-sidebar-collapsed", String(collapsed));
		}
	}, [collapsed, mounted]);

	useEffect(() => {
		if (pathname) {
			onMobileClose?.();
		}
	}, [pathname, onMobileClose]);

	const handleSignOut = async () => {
		await signOut();
		router.push("/");
	};

	const visibleItems = useMemo(() => {
		return navItems.filter((item) => {
			if ("privileged" in item && item.privileged && !isPrivileged) return false;
			if (!searchQuery) return true;
			return item.label.toLowerCase().includes(searchQuery.toLowerCase());
		});
	}, [isPrivileged, searchQuery]);

	const groupedItems = useMemo(() => {
		const groups: Record<string, typeof visibleItems> = {};
		for (const item of visibleItems) {
			if (!groups[item.group]) groups[item.group] = [];
			groups[item.group].push(item);
		}
		return groups;
	}, [visibleItems]);

	if (!mounted) {
		return (
			<div className="hidden h-screen w-[260px] shrink-0 border-r border-default/10 md:block" />
		);
	}

	const sidebarWidth = collapsed ? "w-[72px]" : "w-[260px]";

	return (
		<>
			{mobileOpen ? (
				<button
					type="button"
					aria-label="Close sidebar"
					onClick={onMobileClose}
					className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
				/>
			) : null}

			<aside
				className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-default/10 bg-surface transition-all duration-200 ease-out md:sticky md:translate-x-0 ${sidebarWidth} ${
					mobileOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{/* Logo / Brand */}
				<div
					className={`flex h-14 items-center border-b border-default/10 ${collapsed ? "justify-center px-3" : "justify-between px-5"}`}
				>
					{!collapsed ? (
						<Link href="/dashboard" className="flex items-center gap-2.5">
							<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
								<Layers3 className="h-4 w-4" />
							</div>
							<span className="text-sm font-semibold tracking-tight">Dockroot</span>
						</Link>
					) : (
						<Link
							href="/dashboard"
							className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background"
						>
							<Layers3 className="h-4 w-4" />
						</Link>
					)}
					<button
						type="button"
						onClick={() => setCollapsed((v) => !v)}
						className={`hidden h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-default/20 hover:text-foreground md:inline-flex ${collapsed ? "!hidden" : ""}`}
					>
						<ChevronLeft className="h-3.5 w-3.5" />
					</button>
				</div>

				{/* Search (expanded only) */}
				{!collapsed ? (
					<div className="px-3 pt-3">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
							<input
								type="search"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search..."
								className="h-9 w-full rounded-lg border border-default/10 bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
							/>
						</div>
					</div>
				) : null}

				{/* Environment Switcher (expanded only) */}
				{!collapsed ? (
					<div className="px-3 pt-3">
						<EnvironmentSwitcher
							environments={environments}
							defaultEnvironmentId={defaultEnvironmentId}
						/>
					</div>
				) : null}

				{/* Navigation */}
				<nav className={`mt-3 flex-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>
					{Object.entries(groupedItems).map(([group, items], index) => (
						<div key={group} className={index > 0 ? "mt-4 border-t border-default/8 pt-4" : ""}>
							{!collapsed ? (
								<p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted/60">
									{group === "main"
										? ""
										: group === "runtime"
											? "Runtime"
											: group === "resources"
												? "Resources"
												: group === "ops"
													? "Operations"
													: "Admin"}
								</p>
							) : null}
							<div className="space-y-0.5">
								{items.map((item) => {
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
											className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all ${
												collapsed ? "justify-center" : ""
											} ${
												isActive
													? "bg-foreground/[0.06] text-foreground"
													: "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
											}`}
										>
											<item.icon
												className={`h-4 w-4 shrink-0 ${isActive ? "text-foreground" : "text-muted group-hover:text-foreground"}`}
											/>
											{!collapsed ? <span>{item.label}</span> : null}
										</Link>
									);
								})}
							</div>
						</div>
					))}
				</nav>

				{/* Collapse toggle (bottom of sidebar) */}
				{collapsed ? (
					<div className="border-t border-default/10 px-2 py-3">
						<button
							type="button"
							onClick={() => setCollapsed(false)}
							className="flex h-9 w-full items-center justify-center rounded-lg text-muted transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
						>
							<ChevronRight className="h-4 w-4" />
						</button>
					</div>
				) : null}

				{/* User section */}
				{session && !collapsed ? (
					<div className="border-t border-default/10 p-3">
						<div className="flex items-center gap-3 rounded-lg p-2">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-xs font-semibold">
								{session.user.name?.charAt(0)?.toUpperCase() || "U"}
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">{session.user.name}</p>
								<p className="truncate text-xs text-muted">{session.user.email}</p>
							</div>
							<button
								type="button"
								onClick={handleSignOut}
								title="Sign out"
								className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
							>
								<LogOut className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
				) : null}
				{session && collapsed ? (
					<div className="border-t border-default/10 p-2 py-3">
						<button
							type="button"
							onClick={handleSignOut}
							title="Sign out"
							className="flex h-9 w-full items-center justify-center rounded-lg text-muted transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
						>
							<LogOut className="h-4 w-4" />
						</button>
					</div>
				) : null}
			</aside>
		</>
	);
}
