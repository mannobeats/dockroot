"use client";

import { Cell, Pie, PieChart } from "recharts";
import { ChartFrame } from "@/components/chart-frame";

export const STATUS_COLORS: Record<string, string> = {
	running: "#10b981",
	stopped: "#888888",
	error: "#ef4444",
	paused: "#f59e0b",
	healthy: "#10b981",
	degraded: "#f59e0b",
	down: "#ef4444",
	offline: "#9ca3af",
	provisioning: "#60a5fa",
	succeeded: "#10b981",
	failed: "#ef4444",
	queued: "#f59e0b",
};

function formatLabel(label: string) {
	return label.replaceAll("-", " ");
}

export function DonutStatusCard({
	title,
	items,
	emptyLabel,
}: {
	title: string;
	items: Array<{ label: string; value: number }>;
	emptyLabel: string;
}) {
	const total = items.reduce((sum, item) => sum + item.value, 0);
	const activeItems = items.filter((item) => item.value > 0);

	return (
		<div className="rounded-xl bg-foreground/[0.02] p-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-[11px] font-medium text-muted">{title}</p>
				<span className="text-[11px] tabular-nums text-muted">{total}</span>
			</div>
			{total > 0 ? (
				<>
					<ChartFrame className="mt-2 h-32">
						{({ width, height }) => (
							<PieChart width={width} height={height}>
								<Pie
									data={activeItems}
									dataKey="value"
									nameKey="label"
									cx="50%"
									cy="50%"
									innerRadius={36}
									outerRadius={52}
									paddingAngle={3}
									stroke="none"
								>
									{activeItems.map((entry) => (
										<Cell key={entry.label} fill={STATUS_COLORS[entry.label] || "#888888"} />
									))}
								</Pie>
								<text
									x={width / 2}
									y={height / 2 - 4}
									textAnchor="middle"
									className="fill-foreground text-[18px] font-semibold"
								>
									{total}
								</text>
								<text
									x={width / 2}
									y={height / 2 + 14}
									textAnchor="middle"
									className="fill-[var(--muted)] text-[9px]"
								>
									total
								</text>
							</PieChart>
						)}
					</ChartFrame>
					<div className="mt-1.5 space-y-1.5">
						{activeItems.map((entry) => (
							<div key={entry.label} className="flex items-center gap-2 text-xs">
								<span
									className="h-1.5 w-1.5 shrink-0 rounded-full"
									style={{ backgroundColor: STATUS_COLORS[entry.label] || "#888888" }}
								/>
								<span className="flex-1 capitalize text-muted">{formatLabel(entry.label)}</span>
								<span className="font-mono font-medium tabular-nums">{entry.value}</span>
							</div>
						))}
					</div>
				</>
			) : (
				<p className="mt-3 text-[11px] text-muted">{emptyLabel}</p>
			)}
		</div>
	);
}
