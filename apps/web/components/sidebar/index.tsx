"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { SIDEBAR_NAV_ITEMS } from "./constants";
import { EnvironmentSwitcher } from "./environment-switcher";
import { SidebarBrand } from "./sidebar-brand";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarNavigation } from "./sidebar-navigation";
import type { NavGroup, NavItem, SidebarProps } from "./types";

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
	const selectedEnvironment = environments.find(
		(environment) => environment.id === selectedEnvironmentId,
	);

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
		if (!envOpen) {
			return;
		}

		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setEnvOpen(false);
			}
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

	const handleEnvironmentSwitch = (environmentId: string) => {
		const params = new URLSearchParams(searchParams.toString());
		if (environmentId) {
			params.set("environment", environmentId);
		} else {
			params.delete("environment");
		}
		router.push(`${pathname}?${params.toString()}`);
		setEnvOpen(false);
	};

	const visibleItems = useMemo(() => {
		return SIDEBAR_NAV_ITEMS.filter((item) => !(item.privileged && !isPrivileged));
	}, [isPrivileged]);

	const sections = useMemo(() => {
		const groupedItems = new Map<NavGroup, NavItem[]>();
		for (const item of visibleItems) {
			const existingItems = groupedItems.get(item.group);
			if (existingItems) {
				existingItems.push(item);
			} else {
				groupedItems.set(item.group, [item]);
			}
		}

		return Array.from(groupedItems.entries()).map(([group, items]) => ({ group, items }));
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
				<SidebarBrand collapsed={collapsed} onCollapse={() => setCollapsed(true)} />

				<EnvironmentSwitcher
					collapsed={collapsed}
					envOpen={envOpen}
					environments={environments}
					selectedEnvironmentId={selectedEnvironmentId}
					selectedEnvironment={selectedEnvironment}
					onToggle={() => setEnvOpen((value) => !value)}
					onSelect={handleEnvironmentSwitch}
				/>

				<SidebarNavigation
					collapsed={collapsed}
					pathname={pathname}
					sections={sections}
					selectedEnvironmentId={selectedEnvironmentId}
				/>

				<SidebarFooter
					collapsed={collapsed}
					isAuthenticated={Boolean(session)}
					userName={session?.user.name}
					userEmail={session?.user.email}
					onExpand={() => setCollapsed(false)}
					onSignOut={handleSignOut}
				/>
			</aside>
		</>
	);
}
