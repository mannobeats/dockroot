import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";

export function DashboardAttentionBanner({
	items,
}: {
	items: Array<{
		id: string;
		title: string;
		detail: string;
		status: string;
	}>;
}) {
	if (!items.length) {
		return null;
	}

	return (
		<div className="rounded-lg border border-warning/15 bg-warning/[0.04] px-4 py-3">
			<div className="flex items-center gap-2 text-xs font-medium text-warning">
				<AlertTriangle className="h-3.5 w-3.5" />
				<span>
					{items.length} item{items.length === 1 ? "" : "s"} need
					{items.length === 1 ? "s" : ""} attention
				</span>
			</div>
			<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
				{items.map((item) => (
					<div key={item.id} className="flex items-center gap-2 text-xs">
						<StatusBadge status={item.status} />
						<span className="font-medium">{item.title}</span>
						<span className="text-muted">{item.detail}</span>
					</div>
				))}
			</div>
		</div>
	);
}
