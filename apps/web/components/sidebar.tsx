"use client";

import {
	Activity,
	Boxes,
	ChevronLeft,
	ChevronRight,
	CopyPlus,
	Cpu,
	FolderKanban,
	LayoutDashboard,
	LogOut,
	Network,
	Server,
	Settings,
	TimerReset,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { publicEnv } from "@/lib/public-env";

const navGroups = [
	{
		label: "Management",
		items: [
			{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
			{ href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
			{ href: "/dashboard/environments", label: "Environments", icon: Server },
		],
	},
	{
		label: "Resources",
		items: [
			{ href: "/dashboard/containers", label: "Containers", icon: Cpu },
			{ href: "/dashboard/images", label: "Images", icon: Boxes },
			{ href: "/dashboard/volumes", label: "Volumes", icon: CopyPlus },
			{ href: "/dashboard/networks", label: "Networks", icon: Network },
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
		items: [{ href: "/dashboard/settings", label: "Settings", icon: Settings }],
	},
];

interface SidebarProps {
	mobileOpen?: boolean;
	onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
	const pathname = usePathname();
	const router = useRouter();
	const { data: session } = useSession();
	const [expanded, setExpanded] = useState(true);
	const [mounted, setMounted] = useState(false);

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
				className={`fixed inset-y-0 left-0 z-50 flex h-screen border-r border-default/20 bg-[#060b16] text-white transition-transform duration-300 md:sticky md:translate-x-0 ${
					mobileOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex w-[86px] flex-col items-center gap-4 border-r border-white/8 px-3 py-5">
					<Link
						href="/dashboard"
						className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#3b82f6,#0f172a)] shadow-[0_16px_40px_rgba(59,130,246,0.35)]"
					>
						<Server className="h-5 w-5" />
					</Link>
					<div className="space-y-1 text-center">
						<p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/50">
							{publicEnv.appName}
						</p>
						<p className="text-[11px] text-white/30">Compose Control</p>
					</div>

					<nav className="mt-2 flex flex-1 flex-col items-center gap-2">
						{navGroups
							.flatMap((group) => group.items)
							.map((item) => {
								const isActive =
									pathname === item.href ||
									(item.href !== "/dashboard" && pathname.startsWith(item.href));

								return (
									<Link
										key={item.href}
										href={item.href}
										title={item.label}
										className={`group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all ${
											isActive
												? "bg-white text-slate-950 shadow-[0_10px_30px_rgba(255,255,255,0.18)]"
												: "text-white/55 hover:bg-white/8 hover:text-white"
										}`}
									>
										<item.icon className="h-5 w-5" />
										{isActive && !expanded ? (
											<div className="absolute -right-[14px] h-9 w-1 rounded-full bg-accent" />
										) : null}
									</Link>
								);
							})}
					</nav>

					<button
						type="button"
						onClick={() => setExpanded((value) => !value)}
						className="flex h-11 w-11 items-center justify-center rounded-2xl text-white/55 transition-colors hover:bg-white/8 hover:text-white"
					>
						{expanded ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
					</button>
				</div>

				<div
					className={`flex h-full flex-col overflow-hidden transition-all duration-300 ${
						expanded ? "w-[292px] opacity-100" : "w-0 opacity-0"
					}`}
				>
					<div className="flex h-full min-w-[292px] flex-col px-5 py-5">
						<div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
							<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
								Manager
							</p>
							<h2 className="mt-2 text-lg font-semibold tracking-tight text-white">
								Unified Compose Control
							</h2>
							<p className="mt-2 text-sm leading-6 text-white/55">
								Deploy stacks manually or from GitHub App, then operate every environment from one
								dashboard.
							</p>
						</div>

						<div className="mt-6 flex-1 overflow-y-auto">
							{navGroups.map((group) => (
								<div key={group.label} className="mb-6">
									<p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/30">
										{group.label}
									</p>
									<div className="space-y-1">
										{group.items.map((item) => {
											const isActive =
												pathname === item.href ||
												(item.href !== "/dashboard" && pathname.startsWith(item.href));

											return (
												<Link
													key={item.href}
													href={item.href}
													className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all ${
														isActive
															? "bg-white text-slate-950 shadow-[0_16px_40px_rgba(255,255,255,0.12)]"
															: "text-white/70 hover:bg-white/6 hover:text-white"
													}`}
												>
													<item.icon className="h-4.5 w-4.5" />
													<span>{item.label}</span>
												</Link>
											);
										})}
									</div>
								</div>
							))}
						</div>

						{session ? (
							<div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
								<div className="flex items-center gap-3">
									<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/20 text-sm font-semibold text-accent">
										{session.user.name?.charAt(0)?.toUpperCase() || "U"}
									</div>
									<div className="min-w-0">
										<p className="truncate text-sm font-semibold text-white">{session.user.name}</p>
										<p className="truncate text-xs text-white/50">{session.user.email}</p>
									</div>
								</div>
								<div className="mt-4 flex gap-2">
									<button
										type="button"
										onClick={() => router.push("/dashboard/settings")}
										className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/6 hover:text-white"
									>
										<Settings className="mr-2 h-4 w-4" />
										Settings
									</button>
									<button
										type="button"
										onClick={handleSignOut}
										className="inline-flex items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-sm text-white/65 transition-colors hover:bg-white/6 hover:text-white"
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
