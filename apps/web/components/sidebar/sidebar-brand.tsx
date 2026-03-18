import { ChevronLeft, Layers3 } from "lucide-react";
import Link from "next/link";

interface SidebarBrandProps {
	collapsed: boolean;
	onCollapse: () => void;
}

export function SidebarBrand({ collapsed, onCollapse }: SidebarBrandProps) {
	return (
		<div
			className={`flex h-12 items-center border-b border-default/8 ${collapsed ? "justify-center px-2" : "justify-between px-3"}`}
		>
			{collapsed ? (
				<Link
					href="/dashboard"
					className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white"
				>
					<Layers3 className="h-3.5 w-3.5" />
				</Link>
			) : (
				<Link href="/dashboard" className="flex items-center gap-2">
					<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
						<Layers3 className="h-3.5 w-3.5" />
					</div>
					<span className="text-sm font-bold tracking-tight">Dockroot</span>
				</Link>
			)}
			{collapsed ? null : (
				<button
					type="button"
					onClick={onCollapse}
					className="hidden h-6 w-6 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground md:inline-flex"
				>
					<ChevronLeft className="h-3 w-3" />
				</button>
			)}
		</div>
	);
}
