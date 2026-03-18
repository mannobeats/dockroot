import type { ContainerStats } from "@/components/containers-table-workspace/types";

export function summarizeComposeProject(labels: string | undefined) {
	if (!labels) return "";
	return (
		labels
			.split(",")
			.find((entry) => entry.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=") || ""
	);
}

export function latestRefForMajorUpgrade(imageRef: string) {
	const value = (imageRef || "").trim();
	if (!value || value.includes("@")) return null;
	const lastSlash = value.lastIndexOf("/");
	const lastColon = value.lastIndexOf(":");
	if (lastColon <= lastSlash) return null;
	const repository = value.slice(0, lastColon);
	const tag = value.slice(lastColon + 1);
	if (!repository || !tag || tag === "latest") return null;
	return `${repository}:latest`;
}

export function tagFromImageRef(imageRef: string) {
	const value = (imageRef || "").trim();
	if (!value || value.includes("@")) return null;
	const lastSlash = value.lastIndexOf("/");
	const lastColon = value.lastIndexOf(":");
	if (lastColon <= lastSlash) return null;
	return value.slice(lastColon + 1);
}

export function parsePercent(value: string | undefined): number {
	return Number.parseFloat((value || "0").replace("%", "")) || 0;
}

export function extractUptime(status: string): string {
	if (!status) return "—";
	const match = status.match(/^Up\s+(.+?)(?:\s*\(.*\))?$/i);
	return match ? match[1] : "—";
}

function formatCpu(value: number): string {
	return `${value.toFixed(1)}%`;
}

export function formatMemory(
	memUsage: string | undefined,
	memPerc: string | undefined,
): { usage: string; percent: number } {
	const percent = parsePercent(memPerc);
	if (memUsage) {
		const parts = memUsage.split("/");
		return { usage: parts[0]?.trim() || "—", percent };
	}
	return { usage: "—", percent };
}

export function CpuBar({ percent }: { percent: number }) {
	const color = percent > 80 ? "bg-danger" : percent > 50 ? "bg-warning" : "bg-accent";
	return (
		<div className="flex min-w-[80px] items-center gap-1.5">
			<span className="w-[38px] text-right font-mono text-[11px] tabular-nums">
				{formatCpu(percent)}
			</span>
			<div className="h-1 flex-1 overflow-hidden rounded-full bg-default/10">
				<div
					className={`h-full rounded-full transition-all duration-500 ${color}`}
					style={{ width: `${Math.min(percent, 100)}%` }}
				/>
			</div>
		</div>
	);
}

export function MemoryBar({ usage, percent }: { usage: string; percent: number }) {
	const color = percent > 85 ? "bg-danger" : percent > 60 ? "bg-warning" : "bg-success";
	return (
		<div className="min-w-[90px]">
			<div className="flex items-center gap-1.5">
				<span className="w-[55px] truncate text-right font-mono text-[11px] tabular-nums">
					{usage}
				</span>
				<div className="h-1 flex-1 overflow-hidden rounded-full bg-default/10">
					<div
						className={`h-full rounded-full transition-all duration-500 ${color}`}
						style={{ width: `${Math.min(percent, 100)}%` }}
					/>
				</div>
			</div>
		</div>
	);
}

export function getStatsForContainer(
	containerName: string,
	containerStats: Record<string, ContainerStats>,
) {
	const stats = containerStats[containerName] || {};
	const cpuPercent = parsePercent(stats.CPUPerc);
	const memory = formatMemory(stats.MemUsage, stats.MemPerc);
	return { stats, cpuPercent, memory };
}
