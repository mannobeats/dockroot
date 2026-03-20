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

export function extractUptime(status: string): string {
	if (!status) return "—";
	const match = status.match(/^Up\s+(.+?)(?:\s*\(.*\))?$/i);
	return match ? match[1] : "—";
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let unitIndex = 0;
	let amount = bytes;
	while (amount >= 1024 && unitIndex < units.length - 1) {
		amount /= 1024;
		unitIndex += 1;
	}
	const precision = amount >= 10 || unitIndex === 0 ? 0 : 1;
	return `${amount.toFixed(precision)} ${units[unitIndex]}`;
}

export function CpuBar({ percent }: { percent: number }) {
	const color = percent > 80 ? "bg-danger" : percent > 50 ? "bg-warning" : "bg-accent";
	return (
		<div className="flex min-w-[80px] items-center gap-1.5">
			<span className="w-[38px] text-right font-mono text-[11px] tabular-nums">
				{percent.toFixed(1)}%
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

export function MemoryBar({ usageBytes, percent }: { usageBytes: number; percent: number }) {
	const color = percent > 85 ? "bg-danger" : percent > 60 ? "bg-warning" : "bg-success";
	return (
		<div className="min-w-[90px]">
			<div className="flex items-center gap-1.5">
				<span className="w-[55px] truncate text-right font-mono text-[11px] tabular-nums">
					{formatBytes(usageBytes)}
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

export function StatsSkeleton() {
	return (
		<div className="flex min-w-[80px] items-center gap-1.5">
			<div className="h-3 w-[38px] animate-pulse rounded bg-default/10" />
			<div className="h-1 flex-1 animate-pulse rounded-full bg-default/10" />
		</div>
	);
}
