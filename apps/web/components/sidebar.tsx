"use client";

import {
	ChevronLeft,
	ChevronRight,
	Filter,
	LayoutDashboard,
	LayoutGrid,
	List,
	LogOut,
	Search,
	Server,
	Settings,
	Tag,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { publicEnv } from "@/lib/public-env";

const navItems = [
	{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const filterCategories = [
	{ label: "All", count: 0, active: true },
	{ label: "Active", count: 0, active: false },
	{ label: "Inactive", count: 0, active: false },
	{ label: "Archived", count: 0, active: false },
];

interface SidebarProps {
	mobileOpen?: boolean;
	onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
	const pathname = usePathname();
	const router = useRouter();
	const { data: session } = useSession();
	const [isExpanded, setIsExpanded] = useState(false);
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		const saved = localStorage.getItem("sidebar-expanded");
		if (saved !== null) {
			setIsExpanded(saved === "true");
		}
		setIsMounted(true);
	}, []);

	useEffect(() => {
		if (isMounted) {
			localStorage.setItem("sidebar-expanded", String(isExpanded));
		}
	}, [isExpanded, isMounted]);

	// Close mobile sidebar on route change
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally close on pathname change
	useEffect(() => {
		onMobileClose?.();
	}, [pathname, onMobileClose]);

	const handleSignOut = async () => {
		await signOut();
		router.push("/");
	};

	if (!isMounted)
		return (
			<div className="hidden md:block w-[60px] h-screen border-r border-default/20 bg-surface" />
		);

	return (
		<>
			{/* Mobile overlay backdrop */}
			{mobileOpen && (
				<button
					type="button"
					aria-label="Close sidebar"
					className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
					onClick={onMobileClose}
				/>
			)}

			<div
				className={`
					fixed inset-y-0 left-0 z-50 flex h-screen overflow-hidden transition-transform duration-300 ease-in-out
					md:sticky md:top-0 md:translate-x-0
					${mobileOpen ? "translate-x-0" : "-translate-x-full"}
				`}
			>
				{/* Icon Rail */}
				<aside className="flex h-full w-[60px] flex-col items-center border-r border-default/20 bg-surface py-4 shrink-0">
					{/* Brand */}
					<Link
						href="/dashboard"
						className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white shadow-lg shadow-accent-soft-hover hover:scale-105 transition-transform"
					>
						<Server className="h-5 w-5" />
					</Link>

					{/* Navigation */}
					<nav className="flex flex-1 flex-col items-center gap-3 w-full px-2">
						{navItems.map((item) => {
							const isActive =
								pathname === item.href ||
								(item.href !== "/dashboard" && pathname.startsWith(item.href));
							return (
								<Link
									key={item.href}
									href={item.href}
									title={item.label}
									className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
										isActive
											? "bg-accent text-white shadow-md shadow-accent-soft-hover"
											: "text-muted hover:bg-default/40 hover:text-foreground"
									}`}
								>
									<item.icon className="h-5 w-5" />
									{isActive && !isExpanded && (
										<div className="absolute -right-[10px] h-8 w-1 rounded-l-full bg-accent" />
									)}
								</Link>
							);
						})}
					</nav>

					{/* Toggle + User */}
					<div className="mt-auto flex flex-col items-center gap-3 px-2">
						<button
							type="button"
							onClick={() => setIsExpanded(!isExpanded)}
							className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-default/40 hover:text-foreground transition-all"
						>
							{isExpanded ? (
								<ChevronLeft className="h-5 w-5" />
							) : (
								<ChevronRight className="h-5 w-5" />
							)}
						</button>

						{session && (
							<details className="relative">
								<summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full bg-default/40 transition-colors hover:bg-default/60">
									<div className="flex h-full w-full items-center justify-center rounded-full bg-accent/10 text-[12px] font-bold text-accent">
										{session.user.name?.charAt(0)?.toUpperCase() || "U"}
									</div>
								</summary>
								<div className="absolute bottom-0 left-12 z-50 min-w-52 rounded-xl border border-default/40 bg-surface p-1 shadow-lg">
									<div className="px-3 py-2">
										<p className="text-[13px] font-semibold">{session.user.name}</p>
										<p className="text-[11px] text-muted">{session.user.email}</p>
									</div>
									<button
										type="button"
										onClick={() => router.push("/dashboard/settings")}
										className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-default/30"
									>
										<Settings className="h-3.5 w-3.5" /> Settings
									</button>
									<button
										type="button"
										onClick={handleSignOut}
										className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-danger hover:bg-danger/10"
									>
										<LogOut className="h-3.5 w-3.5" /> Sign Out
									</button>
								</div>
							</details>
						)}
					</div>
				</aside>

				{/* Expandable Panel */}
				<aside
					className={`flex h-full flex-col border-r border-default/20 bg-surface transition-all duration-300 ease-in-out ${
						isExpanded ? "w-[260px] opacity-100" : "w-0 opacity-0 invisible"
					}`}
				>
					<div className="flex flex-col h-full overflow-hidden min-w-[260px]">
						{/* Panel Header */}
						<div className="p-4 border-b border-default/10">
							<div className="flex items-center justify-between mb-4">
								<div className="flex items-center gap-2">
									<div className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
									<h2 className="text-[14px] font-semibold text-foreground tracking-tight">
										{publicEnv.appName}
									</h2>
								</div>
								<button
									type="button"
									onClick={() => setIsExpanded(false)}
									className="text-muted hover:text-foreground transition-colors"
								>
									<ChevronLeft className="h-4 w-4" />
								</button>
							</div>

							{/* Search */}
							<div className="flex items-center gap-2 bg-default/5 p-1 rounded-lg border border-default/10">
								<div className="relative flex-1">
									<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
									<input
										aria-label="Search"
										placeholder="Search..."
										className="w-full h-8 bg-transparent pl-8 pr-2 text-[13px] text-foreground outline-none placeholder:text-muted/60"
									/>
								</div>
								<div className="flex items-center px-1 border-l border-default/10">
									<button
										type="button"
										title="Grid view"
										className="p-1.5 text-accent rounded-md bg-accent/10"
									>
										<LayoutGrid className="h-3.5 w-3.5" />
									</button>
									<button
										type="button"
										title="List view"
										className="p-1.5 text-muted hover:text-foreground"
									>
										<List className="h-3.5 w-3.5" />
									</button>
								</div>
							</div>
						</div>

						{/* Panel Content */}
						<div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 scrollbar-hide">
							{/* Categories */}
							<div className="space-y-3">
								<div className="flex items-center gap-2">
									<Filter className="h-3.5 w-3.5 text-muted" />
									<span className="text-[11px] uppercase tracking-wider font-bold text-muted/60">
										Filters
									</span>
								</div>
								<div className="space-y-1">
									{filterCategories.map((cat) => (
										<button
											type="button"
											key={cat.label}
											className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors ${
												cat.active
													? "bg-accent/10 text-accent font-medium"
													: "text-muted hover:bg-default/10 hover:text-foreground"
											}`}
										>
											<span>{cat.label}</span>
											<span className="text-[11px] text-muted/40">{cat.count}</span>
										</button>
									))}
								</div>
							</div>

							{/* Tags */}
							<div className="space-y-3">
								<div className="flex items-center gap-2">
									<Tag className="h-3.5 w-3.5 text-muted" />
									<span className="text-[11px] uppercase tracking-wider font-bold text-muted/60">
										Tags
									</span>
								</div>
								<p className="text-[12px] text-muted/60 px-1">
									No tags yet. Tags will appear here as you create them.
								</p>
							</div>
						</div>

						{/* Panel Footer */}
						<div className="p-4 border-t border-default/10">
							<button
								type="button"
								className="text-[12px] font-semibold text-accent/80 hover:text-accent transition-colors"
							>
								Clear Filters
							</button>
						</div>
					</div>
				</aside>
			</div>
		</>
	);
}
