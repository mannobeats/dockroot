"use client";

import {
	Activity,
	Boxes,
	ChevronLeft,
	ChevronRight,
	CopyPlus,
	Cpu,
	FolderKanban,
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
import { useEffect, useState } from "react";
import { EnvironmentSwitcher } from "@/components/environment-switcher";
import { signOut, useSession } from "@/lib/auth-client";

const navGroups = [
	{
		label: "Management",
		items: [
			{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
			{ href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
			{ href: "/dashboard/stacks", label: "Stacks", icon: Layers3 },
			{ href: "/dashboard/environments", label: "Environments", icon: Server },
		],
	},
	{
		label: "Resources",
		items: [
			{ href: "/dashboard/containers", label: "Containers", icon: Cpu },
			{ href: "/dashboard/shell", label: "Shell", icon: SquareTerminal },
			{ href: "/dashboard/logs", label: "Logs", icon: Logs },
			{ href: "/dashboard/images", label: "Images", icon: Boxes, privileged: true },
			{ href: "/dashboard/volumes", label: "Volumes", icon: CopyPlus, privileged: true },
			{ href: "/dashboard/networks", label: "Networks", icon: Network, privileged: true },
		],
	},
	{
		label: "Operations",
		items: [
			{ href: "/dashboard/activity", label: "Activity", icon: Activity },
			{ href: "/dashboard/schedules", label: "Schedules", icon: TimerReset },
		],
	},
	{
		label: "Administration",
		items: [{ href: "/dashboard/settings", label: "Settings", icon: Settings, privileged: true }],
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
	const [expanded, setExpanded] = useState(true);
	const [mounted, setMounted] = useState(false);
	const selectedEnvironmentId = searchParams.get("environment") || defaultEnvironmentId || "";

	useEffect(() => {
		const saved = localStorage.getItem("dockroot-sidebar-expanded");
		if (saved) {
			setExpanded(saved === "true");
		}
		setMounted(true);
	}, []);

	useEffect(() => {
		if (mounted) {
			localStorage.setItem("dockroot-sidebar-expanded", String(expanded));
		}
	}, [expanded, mounted]);

	useEffect(() => {
		if (pathname) {
			onMobileClose?.();
		}
	}, [pathname, onMobileClose]);

	const handleSignOut = async () => {
		await signOut();
		router.push("/");
	};

	if (!mounted) {
		return (
			<div className="hidden h-screen w-[88px] shrink-0 border-r border-default/20 md:block" />
		);
	}

	return (
		<>
			{mobileOpen ? (
				<button
					type="button"
					aria-label="Close sidebar"
					onClick={onMobileClose}
					className="fixed inset-0 z-40 bg-black/60 md:hidden"
				/>
			) : null}

			<aside
				className={`fixed inset-y-0 left-0 z-50 flex h-screen border-r border-default/20 bg-surface transition-transform duration-300 md:sticky md:translate-x-0 ${
					mobileOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex w-[68px] flex-col items-center gap-4 border-r border-default/10 px-3 py-5">
					<Link
						href="/dashboard"
						className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-lg shadow-accent/20 transition-transform hover:scale-[1.03]"
					>
						<Server className="h-4 w-4" />
					</Link>

					<div className="mt-2 flex flex-1 flex-col items-center gap-2">
						<div className="h-px w-8 bg-default/10" />
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-default/30 text-muted">
							<FolderKanban className="h-4 w-4" />
						</div>
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-default/20 text-muted">
							<Server className="h-4 w-4" />
						</div>
					</div>

					<button
						type="button"
						onClick={() => setExpanded((value) => !value)}
						className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-default/40 hover:text-foreground"
					>
						{expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
					</button>

					{session ? (
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
							{session.user.name?.charAt(0)?.toUpperCase() || "U"}
						</div>
					) : null}
				</div>

				<div
					className={`flex h-full flex-col overflow-hidden transition-all duration-300 ${
						expanded ? "w-[292px] opacity-100" : "w-0 opacity-0"
					}`}
				>
					<div className="flex h-full min-w-[292px] flex-col px-5 py-5">
						<div className="rounded-2xl border border-default/20 bg-background/60 p-4">
							<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
								Manager
							</p>
							<h2 className="mt-2 text-lg font-semibold tracking-tight">Unified Compose Control</h2>
							<p className="mt-2 text-sm leading-6 text-muted">
								Deploy stacks manually and manage every environment from one dashboard.
							</p>
						</div>

						<EnvironmentSwitcher
							environments={environments}
							defaultEnvironmentId={defaultEnvironmentId}
						/>

						<div className="mt-6 flex-1 overflow-y-auto">
							{navGroups.map((group) => {
								const visibleItems = group.items.filter(
									(item) => !("privileged" in item) || !item.privileged || isPrivileged,
								);

								if (!visibleItems.length) {
									return null;
								}

								return (
									<div key={group.label} className="mb-6">
										<p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
											{group.label}
										</p>
										<div className="space-y-1">
											{visibleItems.map((item) => {
												const isActive =
													pathname === item.href ||
													(item.href !== "/dashboard" && pathname.startsWith(item.href));

												return (
													<Link
														key={item.href}
														href={
															selectedEnvironmentId && item.href !== "/dashboard/environments"
																? `${item.href}?environment=${selectedEnvironmentId}`
																: item.href
														}
														className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
															isActive
																? "bg-accent/10 text-foreground"
																: "text-muted hover:bg-default/30 hover:text-foreground"
														}`}
													>
														<item.icon className="h-4 w-4" />
														<span>{item.label}</span>
													</Link>
												);
											})}
										</div>
									</div>
								);
							})}
						</div>

						{session ? (
							<div className="mt-4 rounded-2xl border border-default/20 bg-background/60 p-4">
								<div className="flex items-center gap-3">
									<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-sm font-semibold text-accent">
										{session.user.name?.charAt(0)?.toUpperCase() || "U"}
									</div>
									<div className="min-w-0">
										<p className="truncate text-sm font-semibold">{session.user.name}</p>
										<p className="truncate text-xs text-muted">{session.user.email}</p>
									</div>
								</div>
								<div className="mt-4 flex gap-2">
									{isPrivileged ? (
										<button
											type="button"
											onClick={() => router.push("/dashboard/settings")}
											className="inline-flex flex-1 items-center justify-center rounded-xl border border-default/20 px-3 py-2 text-sm text-muted transition-colors hover:bg-default/30 hover:text-foreground"
										>
											<Settings className="mr-2 h-4 w-4" />
											Settings
										</button>
									) : null}
									<button
										type="button"
										onClick={handleSignOut}
										className={`inline-flex items-center justify-center rounded-xl border border-default/20 px-3 py-2 text-sm text-muted transition-colors hover:bg-default/30 hover:text-foreground ${
											isPrivileged ? "" : "flex-1"
										}`}
									>
										<LogOut className="h-4 w-4" />
									</button>
								</div>
							</div>
						) : null}
					</div>
				</div>
			</aside>
		</>
	);
}
