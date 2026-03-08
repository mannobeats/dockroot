import Link from "next/link";
import { createEnvironmentAction, deleteEnvironmentAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Infrastructure"
				title="Environments"
				description={`${environments.length} environments — manage and monitor your deployment targets`}
			/>

			{/* Compact table view — inspired by competitor's scalable layout */}
			<Panel>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Status</DataTableHead>
							<DataTableHead>Kind</DataTableHead>
							<DataTableHead>Stacks</DataTableHead>
							<DataTableHead>Host</DataTableHead>
							<DataTableHead>Actions</DataTableHead>
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
												className="font-medium transition-colors hover:text-foreground/80"
											>
												{environment.name}
											</Link>
											<p className="mt-0.5 text-xs text-muted">
												{environment.description || "No description"}
											</p>
										</DataTableCell>
										<DataTableCell>
											<StatusBadge status={environment.status} />
										</DataTableCell>
										<DataTableCell>
											<span className="capitalize text-xs text-muted">{environment.kind}</span>
										</DataTableCell>
										<DataTableCell className="text-xs text-muted">{environment.stacks.length}</DataTableCell>
										<DataTableCell className="text-xs text-muted">
											{agent?.hostname || "Awaiting registration"}
										</DataTableCell>
										<DataTableCell>
											<div className="flex gap-1.5">
												<LinkButton href={`/dashboard?environment=${environment.id}`} size="xs">
													Open
												</LinkButton>
												<LinkButton
													href={`/dashboard/environments/${environment.id}`}
													variant="outline"
													size="xs"
												>
													Details
												</LinkButton>
												{environment.isDefaultLocal ? null : (
													<form action={deleteEnvironmentAction}>
														<input type="hidden" name="environmentId" value={environment.id} />
														<FormSubmitButton label="Delete" pendingLabel="Deleting..." variant="quietDanger" size="xs" />
													</form>
												)}
											</div>
										</DataTableCell>
									</DataTableRow>
								);
							})}
					</DataTableBody>
				</DataTable>
			</Panel>

			{/* Add environment form — clean card */}
			<Panel padding="md">
				<h2 className="text-sm font-semibold">Add environment</h2>
				<p className="mt-1 text-xs text-muted">
					Create a remote environment and deploy the Dockroot agent.
				</p>
				<form action={createEnvironmentAction} className="mt-4 grid gap-4 sm:grid-cols-3">
					<Field>
						<FieldLabel htmlFor="environment-name">Name</FieldLabel>
						<Input id="environment-name" name="name" required placeholder="prod-fra-01" />
					</Field>
					<Field>
						<FieldLabel htmlFor="environment-description">Description</FieldLabel>
						<Input
							id="environment-description"
							name="description"
							placeholder="Hetzner VM for production"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="agent-url">Agent URL</FieldLabel>
						<div className="flex gap-2">
							<Input id="agent-url" name="agentUrl" placeholder="http://agent:9095" />
							<FormSubmitButton label="Create" pendingLabel="Creating..." />
						</div>
					</Field>
				</form>
			</Panel>
		</div>
	);
}
