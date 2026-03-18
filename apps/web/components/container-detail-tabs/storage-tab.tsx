import { Panel } from "@/components/ui/panel";

interface StorageTabProps {
	mounts: Array<{ Source?: string; Destination?: string; Type?: string; RW?: boolean }>;
}

export function StorageTab({ mounts }: StorageTabProps) {
	return (
		<Panel padding="sm">
			<p className="text-sm font-semibold">Mounts</p>
			<div className="mt-3 space-y-2 text-sm text-muted">
				{mounts.length ? (
					mounts.map((mount) => (
						<div
							key={`${mount.Source}-${mount.Destination}`}
							className="rounded-lg bg-foreground/[0.03] px-3 py-2"
						>
							<p className="font-medium text-foreground">{mount.Destination || "Unknown"}</p>
							<p className="mt-0.5 text-xs">{mount.Source || mount.Type || "Docker managed"}</p>
							<p className="mt-1 text-[11px] text-muted">
								{mount.RW === false ? "Read-only" : "Read-write"}
							</p>
						</div>
					))
				) : (
					<p>No mounts configured.</p>
				)}
			</div>
		</Panel>
	);
}
