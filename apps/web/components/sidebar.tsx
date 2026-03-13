"use client";

import {
	Activity,
	Boxes,
	ChevronLeft,
	ChevronRight,
	ChevronsUpDown,
	Cpu,
	HardDrive,
	Layers3,
	LayoutDashboard,
	LogOut,
	Logs,
	Network,
	Server,
	Settings,
	SquareTerminal,
	TimerReset,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";

const navItems = [
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

const groupLabels: Record<string, string> = {
	main: "",
	runtime: "Runtime",
	resources: "Resources",
	ops: "Operations",
	admin: "",
};

interface SidebarProps {
	environments?: Array<{ id: string; name: string; kind: string }>;
	defaultEnvironmentId?: string;
	mobileOpen?: boolean;
	onMobileClose?: () => void;
}

export function Sidebar({
	environments = [],
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
	const [envOpen, setEnvOpen] = useState(false);
	const selectedEnvironmentId = searchParams.get("environment") || defaultEnvironmentId || "";
	const selectedEnv = environments.find((e) => e.id === selectedEnvironmentId);

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

	useEffect(() => {
		if (!envOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setEnvOpen(false);
		};
		const onClick = () => setEnvOpen(false);
		window.addEventListener("keydown", onKey);
		window.addEventListener("click", onClick);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("click", onClick);
		};
	}, [envOpen]);

	const handleSignOut = async () => {
		await signOut();
		router.push("/");
	};

	const handleEnvSwitch = (envId: string) => {
		const params = new URLSearchParams(searchParams.toString());
		if (envId) {
			params.set("environment", envId);
		} else {
			params.delete("environment");
		}
		router.push(`${pathname}?${params.toString()}`);
		setEnvOpen(false);
	};

	const visibleItems = useMemo(() => {
		return navItems.filter((item) => {
			if ("privileged" in item && item.privileged && !isPrivileged) return false;
			return true;
		});
	}, [isPrivileged]);

	const groupedItems = useMemo(() => {
		const groups: Record<string, typeof visibleItems> = {};
		for (const item of visibleItems) {
			if (!groups[item.group]) groups[item.group] = [];
			groups[item.group].push(item);
		}
		return groups;
	}, [visibleItems]);

	if (!mounted) {
		return <div className="hidden h-full w-[220px] shrink-0 border-r border-default/8 md:block" />;
	}

	const sidebarWidth = collapsed ? "w-[52px]" : "w-[220px]";

	return (
		<>
			{mobileOpen ? (
				<button
					type="button"
					aria-label="Close sidebar"
					onClick={onMobileClose}
					className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
				/>
			) : null}

			<aside
				className={`fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r border-default/8 bg-surface transition-all duration-200 ease-out md:sticky md:top-0 md:translate-x-0 ${sidebarWidth} ${
					mobileOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{/* Logo */}
				<div
					className={`flex h-12 items-center border-b border-default/8 ${collapsed ? "justify-center px-2" : "justify-between px-3"}`}
				>
					{!collapsed ? (
						<Link href="/dashboard" className="flex items-center gap-2">
							<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
								<Layers3 className="h-3.5 w-3.5" />
							</div>
							<span className="text-sm font-bold tracking-tight">Dockroot</span>
						</Link>
					) : (
						<Link
							href="/dashboard"
							className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white"
						>
							<Layers3 className="h-3.5 w-3.5" />
						</Link>
					)}
					{!collapsed ? (
						<button
							type="button"
							onClick={() => setCollapsed(true)}
							className="hidden h-6 w-6 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground md:inline-flex"
						>
							<ChevronLeft className="h-3 w-3" />
						</button>
					) : null}
				</div>

				{/* Environment Switcher */}
				{environments.length > 0 ? (
					<div
						className={`relative border-b border-default/8 ${collapsed ? "px-1 py-1.5" : "px-2 py-2"}`}
					>
						{collapsed ? (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									setEnvOpen(!envOpen);
								}}
								title={
									selectedEnv ? `${selectedEnv.name} (${selectedEnv.kind})` : "Switch environment"
								}
								className="flex h-8 w-full items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
							>
								<Server className="h-3.5 w-3.5" />
							</button>
						) : (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									setEnvOpen(!envOpen);
								}}
								className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-foreground/[0.04]"
							>
								<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06]">
									<Server className="h-3 w-3 text-muted" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-[12px] font-medium leading-tight">
										{selectedEnv?.name || "Select environment"}
									</p>
									<p className="truncate text-[10px] leading-tight text-muted">
										{selectedEnv?.kind || "none"}
									</p>
								</div>
								<ChevronsUpDown className="h-3 w-3 shrink-0 text-muted/60" />
							</button>
						)}

						{envOpen ? (
							<div
								role="listbox"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={undefined}
								className={`absolute z-50 mt-1 overflow-hidden rounded-xl border border-default/12 bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)] ${
									collapsed ? "left-full top-0 ml-1 w-52" : "left-2 right-2"
								}`}
							>
								<div className="p-1">
									{environments.map((env) => {
										const active = env.id === selectedEnvironmentId;
										return (
											<button
												key={env.id}
												type="button"
												role="option"
												aria-selected={active}
												onClick={() => handleEnvSwitch(env.id)}
												className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors duration-100 ${
													active
														? "bg-foreground/[0.06] text-foreground"
														: "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
												}`}
											>
												<div
													className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-accent" : "bg-default/20"}`}
												/>
												<div className="min-w-0 flex-1">
													<p className="truncate font-medium">{env.name}</p>
												</div>
												<span className="shrink-0 text-[10px] text-muted">{env.kind}</span>
											</button>
										);
									})}
								</div>
							</div>
						) : null}
					</div>
				) : null}

				{/* Navigation */}
				<nav className={`mt-2 flex-1 overflow-y-auto ${collapsed ? "px-1" : "px-2"}`}>
					{Object.entries(groupedItems).map(([group, items], index) => (
						<div key={group} className={index > 0 ? "mt-3 pt-3 border-t border-default/6" : ""}>
							{!collapsed && groupLabels[group] ? (
								<p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/50">
									{groupLabels[group]}
								</p>
							) : null}
							<div className="space-y-px">
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
											className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
												collapsed ? "justify-center" : ""
											} ${
												isActive
													? "bg-foreground/[0.06] text-foreground"
													: "text-muted hover:bg-foreground/[0.04] hover:text-foreground"
											}`}
										>
											<item.icon
												className={`h-4 w-4 shrink-0 ${isActive ? "text-foreground" : "text-muted/70 group-hover:text-foreground"}`}
											/>
											{!collapsed ? <span>{item.label}</span> : null}
										</Link>
									);
								})}
							</div>
						</div>
					))}
				</nav>

				{/* Bottom section */}
				<div className="border-t border-default/8">
					{collapsed ? (
						<div className="flex flex-col items-center gap-1 p-1.5">
							<button
								type="button"
								onClick={() => setCollapsed(false)}
								className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
							>
								<ChevronRight className="h-3.5 w-3.5" />
							</button>
							{session ? (
								<button
									type="button"
									onClick={handleSignOut}
									title="Sign out"
									className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
								>
									<LogOut className="h-3.5 w-3.5" />
								</button>
							) : null}
						</div>
					) : session ? (
						<div className="flex items-center gap-2.5 p-2.5">
							<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[11px] font-bold text-accent">
								{session.user.name?.charAt(0)?.toUpperCase() || "U"}
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-xs font-medium">{session.user.name}</p>
								<p className="truncate text-[11px] text-muted">{session.user.email}</p>
							</div>
							<button
								type="button"
								onClick={handleSignOut}
								title="Sign out"
								className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground"
							>
								<LogOut className="h-3 w-3" />
							</button>
						</div>
					) : null}
				</div>
			</aside>
		</>
	);
}
