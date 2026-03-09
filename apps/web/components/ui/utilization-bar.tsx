import { cn } from "@/lib/cn";

function clampPercent(value: number) {
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, Math.min(100, value));
}

function getToneClasses(percent: number) {
	if (percent >= 90) {
		return "bg-danger/90";
	}
	if (percent >= 75) {
		return "bg-warning/90";
	}
	return "bg-success/90";
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
	const toneClass = getToneClasses(safePercent);

	return (
		<div className={cn("space-y-2", className)}>
			<div className="flex items-center justify-between gap-3 text-xs">
				<span className="font-medium text-foreground">{label}</span>
				<span className="tabular-nums text-muted">{valueLabel}</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
				<div
					className={cn("h-full rounded-full transition-[width] duration-300 ease-out", toneClass)}
					style={{ width: `${safePercent}%` }}
				/>
			</div>
			{helper ? <p className="text-[11px] text-muted">{helper}</p> : null}
		</div>
	);
}
