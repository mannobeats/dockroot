interface VolumeBackupStatusBadgeProps {
	status: string;
}

export function VolumeBackupStatusBadge({ status }: VolumeBackupStatusBadgeProps) {
	switch (status) {
		case "completed":
			return (
				<span className="inline-flex items-center rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
					Completed
				</span>
			);
		case "failed":
			return (
				<span className="inline-flex items-center rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
					Failed
				</span>
			);
		default:
			return (
				<span className="inline-flex animate-pulse items-center rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
					In progress
				</span>
			);
	}
}
