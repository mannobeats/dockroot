"use client";

import { Skeleton } from "@heroui/react";
import { Bell, ChevronRight, Palette, Shield, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

export default function SettingsPage() {
	const { data: session, isPending } = useSession();
	const router = useRouter();

	if (isPending) {
		return (
			<div className="flex flex-col gap-5">
				<Skeleton className="h-8 w-48 rounded-lg" />
				<Skeleton className="h-48 rounded-xl" />
			</div>
		);
	}

	if (!session) {
		router.push("/sign-in");
		return null;
	}

	const settingSections = [
		{
			icon: User,
			title: "Profile",
			description: "Manage your personal information and preferences",
		},
		{
			icon: Bell,
			title: "Notifications",
			description: "Configure how you receive alerts and updates",
		},
		{
			icon: Shield,
			title: "Security",
			description: "Password, two-factor authentication, and sessions",
		},
		{
			icon: Palette,
			title: "Appearance",
			description: "Theme, color scheme, and display preferences",
		},
	];

	return (
		<div className="flex flex-col gap-4 sm:gap-6">
			<div>
				<h1 className="text-lg sm:text-xl font-semibold tracking-tight">Settings</h1>
				<p className="mt-0.5 text-[13px] text-muted">
					Manage your account and application preferences
				</p>
			</div>

			{/* Account Card */}
			<div className="rounded-xl border border-default/40 bg-surface">
				<div className="border-b border-default/30 px-5 py-3.5">
					<h2 className="text-[14px] font-semibold">Account</h2>
					<p className="mt-0.5 text-[12px] text-muted">Your account information</p>
				</div>
				<div className="flex items-center gap-4 px-5 py-5">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-lg font-semibold text-accent">
						{session.user.name?.charAt(0)?.toUpperCase() || "U"}
					</div>
					<div>
						<p className="text-[15px] font-semibold">{session.user.name}</p>
						<p className="text-[13px] text-muted">{session.user.email}</p>
					</div>
				</div>
			</div>

			{/* Settings Sections */}
			<div className="rounded-xl border border-default/40 bg-surface">
				<div className="border-b border-default/30 px-5 py-3.5">
					<h2 className="text-[14px] font-semibold">Preferences</h2>
				</div>
				<div className="divide-y divide-default/20">
					{settingSections.map((section) => (
						<button
							type="button"
							key={section.title}
							className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-default/30"
						>
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/8">
								<section.icon className="h-4 w-4 text-accent" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-[13px] font-medium">{section.title}</p>
								<p className="text-[12px] text-muted">{section.description}</p>
							</div>
							<ChevronRight className="h-4 w-4 shrink-0 text-muted" />
						</button>
					))}
				</div>
			</div>

			{/* Danger Zone */}
			<div className="rounded-xl border border-danger/30 bg-surface">
				<div className="border-b border-danger-soft-hover px-5 py-3.5">
					<h2 className="text-[14px] font-semibold text-danger">Danger Zone</h2>
				</div>
				<div className="flex items-center justify-between px-5 py-4">
					<div>
						<p className="text-[13px] font-medium">Delete Account</p>
						<p className="text-[12px] text-muted">Permanently delete your account and all data</p>
					</div>
					<button
						type="button"
						className="inline-flex h-8 items-center justify-center rounded-lg bg-danger px-3 text-[13px] font-medium text-danger-foreground transition-colors hover:opacity-90"
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	);
}
