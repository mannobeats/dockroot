"use client";

import { Layers3, LayoutDashboard, LogOut, Menu, Settings, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { signOut, useSession } from "@/lib/auth-client";
import { publicEnv } from "@/lib/public-env";

export function Navbar() {
	const { data: session } = useSession();
	const router = useRouter();
	const [mobileOpen, setMobileOpen] = useState(false);

	const handleSignOut = async () => {
		await signOut();
		router.push("/");
	};

	return (
		<nav className="sticky top-0 z-50 border-b border-default/8 bg-surface/70 backdrop-blur-xl backdrop-saturate-150">
			<div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-4 sm:px-6">
				<Link href="/" className="flex items-center gap-2.5">
					<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-[var(--shadow-sm)]">
						<Layers3 className="h-4 w-4" />
					</div>
					<span className="text-[15px] font-bold tracking-tight">{publicEnv.appName}</span>
				</Link>

				<div className="hidden items-center gap-1 sm:flex">
					{session && (
						<Link
							href="/dashboard"
							className="rounded-xl px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
						>
							Dashboard
						</Link>
					)}
				</div>

				<div className="hidden items-center gap-2 sm:flex">
					<ThemeToggle />
					{session ? (
						<details className="relative">
							<summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-xl bg-accent/10 text-xs font-bold text-accent transition-colors hover:bg-accent/20">
								{session.user.name?.charAt(0)?.toUpperCase() || "U"}
							</summary>
							<Panel
								tone="subtle"
								className="absolute right-0 top-11 z-50 min-w-52 p-1.5 shadow-[var(--shadow-lg)]"
							>
								<div className="px-3 py-2.5">
									<p className="text-[13px] font-semibold">{session.user.name}</p>
									<p className="text-[11px] text-muted">{session.user.email}</p>
								</div>
								<button
									type="button"
									onClick={() => router.push("/dashboard")}
									className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors hover:bg-foreground/[0.04]"
								>
									<LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
								</button>
								<button
									type="button"
									onClick={() => router.push("/dashboard/settings")}
									className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors hover:bg-foreground/[0.04]"
								>
									<Settings className="h-3.5 w-3.5" /> Settings
								</button>
								<button
									type="button"
									onClick={handleSignOut}
									className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger/8"
								>
									<LogOut className="h-3.5 w-3.5" /> Sign Out
								</button>
							</Panel>
						</details>
					) : (
						<>
							<Button variant="ghost" size="sm" onClick={() => router.push("/sign-in")}>
								Sign In
							</Button>
							<Button size="sm" onClick={() => router.push("/sign-up")}>
								Get Started
							</Button>
						</>
					)}
				</div>

				<div className="flex items-center gap-2 sm:hidden">
					<ThemeToggle />
					<Button
						onClick={() => setMobileOpen(!mobileOpen)}
						aria-label="Toggle menu"
						variant="ghost"
						size="icon"
					>
						{mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
					</Button>
				</div>
			</div>

			{mobileOpen && (
				<div className="border-t border-default/8 bg-surface px-4 pb-4 pt-2 sm:hidden">
					<div className="flex flex-col gap-1">
						{session ? (
							<>
								<Link
									href="/dashboard"
									className="rounded-xl px-3 py-2 text-[13px] font-medium hover:bg-foreground/[0.04]"
									onClick={() => setMobileOpen(false)}
								>
									Dashboard
								</Link>
								<Link
									href="/dashboard/settings"
									className="rounded-xl px-3 py-2 text-[13px] font-medium hover:bg-foreground/[0.04]"
									onClick={() => setMobileOpen(false)}
								>
									Settings
								</Link>
								<button
									type="button"
									onClick={handleSignOut}
									className="rounded-xl px-3 py-2 text-left text-[13px] font-medium text-danger hover:bg-danger/8"
								>
									Sign Out
								</button>
							</>
						) : (
							<>
								<Link
									href="/sign-in"
									className="rounded-xl px-3 py-2 text-[13px] font-medium hover:bg-foreground/[0.04]"
									onClick={() => setMobileOpen(false)}
								>
									Sign In
								</Link>
								<LinkButton
									href="/sign-up"
									variant="secondary"
									size="md"
									className="justify-start"
									onClick={() => setMobileOpen(false)}
								>
									Get Started
								</LinkButton>
							</>
						)}
					</div>
				</div>
			)}
		</nav>
	);
}
