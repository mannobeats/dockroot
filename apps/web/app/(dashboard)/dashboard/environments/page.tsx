import { ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { createEnvironmentAction, deleteEnvironmentAction } from "@/app/(dashboard)/actions";
import { CreateEnvironmentModal } from "@/components/create-environment-modal";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { listEnvironments } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function EnvironmentsPage() {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const environments = await listEnvironments(session.user.id);

	return (
		<div className="animate-in space-y-5">
			<PageHeader
				title="Environments"
				description={`${environments.length} environments`}
				actions={<CreateEnvironmentModal action={createEnvironmentAction} />}
			/>

			<Panel>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Status</DataTableHead>
							<DataTableHead>Kind</DataTableHead>
							<DataTableHead>Stacks</DataTableHead>
							<DataTableHead>Host</DataTableHead>
							<DataTableHead className="w-20 text-right">Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{environments.map((environment) => {
							const agent = environment.agent[0];
							return (
								<DataTableRow key={environment.id}>
									<DataTableCell>
										<Link
											href={`/dashboard/environments/${environment.id}`}
											className="font-medium transition-colors hover:text-accent"
										>
											{environment.name}
										</Link>
										<p className="text-[11px] text-muted">
											{environment.description || "No description"}
										</p>
									</DataTableCell>
									<DataTableCell>
										<StatusBadge status={environment.status} />
									</DataTableCell>
									<DataTableCell>
										<span className="capitalize text-xs text-muted">{environment.kind}</span>
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{environment.stacks.length}
									</DataTableCell>
									<DataTableCell className="text-xs text-muted">
										{agent?.hostname || "Awaiting registration"}
									</DataTableCell>
									<DataTableCell>
										<div className="flex items-center justify-end gap-0.5">
											<LinkButton
												href={`/dashboard?environment=${environment.id}`}
												variant="ghost"
												size="icon-xs"
												title="Open workspace"
											>
												<ExternalLink className="h-3.5 w-3.5" />
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
													triggerSize="xs"
													hiddenFields={{ environmentId: environment.id }}
													triggerClassName="h-6 w-6 p-0 text-muted hover:text-danger"
													triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
												/>
											)}
										</div>
									</DataTableCell>
								</DataTableRow>
							);
						})}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
