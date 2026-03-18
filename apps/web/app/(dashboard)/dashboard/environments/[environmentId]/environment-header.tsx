import { ArrowLeft, Trash2 } from "lucide-react";
import { deleteEnvironmentAction } from "@/app/(dashboard)/actions";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/ui/link-button";

export function EnvironmentDetailHeader({
	environment,
}: {
	environment: {
		id: string;
		name: string;
		status: string;
		kind: string;
		isDefaultLocal: boolean;
	};
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex items-center gap-2.5">
				<LinkButton href="/dashboard/environments" variant="ghost" size="icon-sm">
					<ArrowLeft className="h-4 w-4" />
				</LinkButton>
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-lg font-semibold">{environment.name}</h1>
						<StatusBadge status={environment.status} />
					</div>
					<p className="text-xs text-muted capitalize">{environment.kind} environment</p>
				</div>
			</div>
			<div className="flex items-center gap-1">
				<LinkButton href={`/dashboard?environment=${environment.id}`} size="sm">
					Open workspace
				</LinkButton>
				{environment.isDefaultLocal ? null : (
					<DestructiveActionModal
						action={deleteEnvironmentAction}
						title={`Delete environment ${environment.name}`}
						description="This will permanently remove the environment and linked runtime metadata."
						triggerLabel=""
						confirmLabel="Delete"
						pendingLabel="Deleting..."
						triggerVariant="ghost"
						triggerSize="sm"
						hiddenFields={{ environmentId: environment.id }}
						triggerClassName="h-8 w-8 p-0 text-muted hover:text-danger"
						triggerIcon={<Trash2 className="h-4 w-4" />}
					/>
				)}
			</div>
		</div>
	);
}
