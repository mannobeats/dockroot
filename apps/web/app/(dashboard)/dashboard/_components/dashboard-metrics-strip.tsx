import { Boxes, Layers3, PlayCircle, Server } from "lucide-react";

function MetricInline({
	icon,
	value,
	label,
	first,
}: {
	icon: React.ReactNode;
	value: string;
	label: string;
	first?: boolean;
}) {
	return (
		<div className={`flex items-center gap-2.5 ${first ? "pr-5" : "px-5"}`}>
			{icon}
			<div>
				<p className="text-xl leading-none font-bold tracking-tight tabular-nums">{value}</p>
				<p className="mt-0.5 text-[11px] text-muted">{label}</p>
			</div>
		</div>
	);
}

export function DashboardMetricsStrip({
	stackCount,
	environmentCount,
	deploymentCount,
	containerCount,
	imageCount,
}: {
	stackCount: number;
	environmentCount: number;
	deploymentCount: number;
	containerCount: number | null;
	imageCount: number | null;
}) {
	return (
		<div className="flex flex-wrap items-center divide-x divide-default/10">
			<MetricInline
				icon={<Layers3 className="h-3.5 w-3.5 text-muted" />}
				value={String(stackCount)}
				label="Stacks"
				first
			/>
			<MetricInline
				icon={<Server className="h-3.5 w-3.5 text-muted" />}
				value={String(environmentCount)}
				label="Environments"
			/>
			<MetricInline
				icon={<PlayCircle className="h-3.5 w-3.5 text-muted" />}
				value={String(deploymentCount)}
				label="Deployments"
			/>
			<MetricInline
				icon={<Boxes className="h-3.5 w-3.5 text-muted" />}
				value={containerCount !== null ? String(containerCount) : "—"}
				label={imageCount !== null ? `${imageCount} images` : "Containers"}
			/>
		</div>
	);
}
