import { ChevronRight, LogOut } from "lucide-react";

interface SidebarFooterProps {
	collapsed: boolean;
	isAuthenticated: boolean;
	userName?: string;
	userEmail?: string;
	onExpand: () => void;
	onSignOut: () => void;
}

export function SidebarFooter({
	collapsed,
	isAuthenticated,
	userName,
	userEmail,
	onExpand,
	onSignOut,
}: SidebarFooterProps) {
	return (
		<div className="border-t border-default/8">
			{collapsed ? (
				<div className="flex flex-col items-center gap-1 p-1.5">
					<button
						type="button"
						onClick={onExpand}
						className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
					>
						<ChevronRight className="h-3.5 w-3.5" />
					</button>
					{isAuthenticated ? (
						<button
							type="button"
							onClick={onSignOut}
							title="Sign out"
							className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
						>
							<LogOut className="h-3.5 w-3.5" />
						</button>
					) : null}
				</div>
			) : isAuthenticated ? (
				<div className="flex items-center gap-2.5 p-2.5">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[11px] font-bold text-accent">
						{userName?.charAt(0)?.toUpperCase() || "U"}
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-xs font-medium">{userName}</p>
						<p className="truncate text-[11px] text-muted">{userEmail}</p>
					</div>
					<button
						type="button"
						onClick={onSignOut}
						title="Sign out"
						className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground"
					>
						<LogOut className="h-3 w-3" />
					</button>
				</div>
			) : null}
		</div>
	);
}
