import { MetricCard } from "@/components/ui/metric-card";

export function EnvironmentConnectionCards({
	environment,
	runtimeEndpoint,
	hostname,
	dockerVersion,
}: {
	environment: { kind: string };
	runtimeEndpoint: string;
	hostname: string;
	dockerVersion: string;
}) {
	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<MetricCard label="Kind" value={environment.kind} valueClassName="text-sm capitalize" />
			<MetricCard
				label={environment.kind === "local" ? "Runtime URL" : "Agent URL"}
				value={runtimeEndpoint}
				valueClassName="break-all text-sm"
			/>
			<MetricCard label="Hostname" value={hostname} valueClassName="text-sm" />
			<MetricCard label="Docker version" value={dockerVersion} valueClassName="text-sm" />
		</div>
	);
}
