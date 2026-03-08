import { Server } from "lucide-react";
import { publicEnv } from "@/lib/public-env";
import { Badge } from "@/components/ui/badge";

export function Footer() {
	return (
		<footer className="border-t border-default/30">
			<div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6">
				<div className="flex items-center gap-2">
					<div className="flex h-5 w-5 items-center justify-center rounded bg-accent text-white">
						<Server className="h-3 w-3" />
					</div>
					<span className="text-[13px] font-medium">{publicEnv.appName}</span>
				</div>
				<p className="flex items-center gap-2 text-[12px] text-muted">
					<Badge variant="accent" className="px-2 py-0.5 text-[11px]">
						Platform UI
					</Badge>
					&copy; {new Date().getFullYear()} Dockroot. All rights reserved.
				</p>
			</div>
		</footer>
	);
}
