import { cn } from "@/lib/cn";

function clampPercent(value: number) {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, Math.min(100, value));
}

function getToneClass(percent: number) {
	if (percent >= 90) return "bg-rose-500";
	if (percent >= 75) return "bg-amber-500";
	return "bg-emerald-500";
}

export function UtilizationBar({
	label,
	valueLabel,
	percent,
	helper,
	className,
}: {
	label: string;
	valueLabel: string;
	percent: number;
	helper?: string;
	className?: string;
}) {
	const safePercent = clampPercent(percent);
	const toneClass = getToneClass(safePercent);

	return (
		<div className={cn("space-y-1.5", className)}>
			<div className="flex items-center justify-between gap-3 text-xs">
				<span className="font-medium text-foreground">{label}</span>
				<span className="tabular-nums text-muted">{valueLabel}</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.05]">
				<div
					className={cn("h-full rounded-full transition-[width] duration-500 ease-out", toneClass)}
					style={{ width: `${safePercent}%` }}
				/>
			</div>
			{helper ? <p className="text-[11px] text-muted">{helper}</p> : null}
		</div>
	);
}
