import Link from "next/link";
import { createEnvironmentAction } from "@/app/(dashboard)/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
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
			<div className="rounded-xl border border-default/10 bg-surface">
				<div className="table-scroll">
					<table className="min-w-full text-left text-sm">
						<thead>
							<tr className="border-b border-default/10 text-xs text-muted">
								<th className="px-4 py-3 font-medium">Name</th>
								<th className="px-4 py-3 font-medium">Status</th>
								<th className="px-4 py-3 font-medium">Kind</th>
								<th className="px-4 py-3 font-medium">Stacks</th>
								<th className="px-4 py-3 font-medium">Host</th>
								<th className="px-4 py-3 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-default/5">
							{environments.map((environment) => {
								const agent = environment.agent[0];
								return (
									<tr key={environment.id} className="transition-colors hover:bg-foreground/[0.02]">
										<td className="px-4 py-3">
											<Link
												href={`/dashboard/environments/${environment.id}`}
												className="font-medium transition-colors hover:text-foreground/80"
											>
												{environment.name}
											</Link>
											<p className="mt-0.5 text-xs text-muted">
												{environment.description || "No description"}
											</p>
										</td>
										<td className="px-4 py-3">
											<StatusBadge status={environment.status} />
										</td>
										<td className="px-4 py-3">
											<span className="capitalize text-xs text-muted">{environment.kind}</span>
										</td>
										<td className="px-4 py-3 text-xs text-muted">{environment.stacks.length}</td>
										<td className="px-4 py-3 text-xs text-muted">
											{agent?.hostname || "Awaiting registration"}
										</td>
										<td className="px-4 py-3">
											<div className="flex gap-1.5">
												<Link
													href={`/dashboard?environment=${environment.id}`}
													className="inline-flex h-7 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
												>
													Open
												</Link>
												<Link
													href={`/dashboard/environments/${environment.id}`}
													className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
												>
													Details
												</Link>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>

			{/* Add environment form — clean card */}
			<div className="rounded-xl border border-default/10 bg-surface p-5">
				<h2 className="text-sm font-semibold">Add environment</h2>
				<p className="mt-1 text-xs text-muted">
					Create a remote environment and deploy the Dockroot agent.
				</p>
				<form action={createEnvironmentAction} className="mt-4 grid gap-4 sm:grid-cols-3">
					<div className="space-y-1.5">
						<label htmlFor="environment-name" className="text-xs font-medium text-muted">
							Name
						</label>
						<input
							id="environment-name"
							name="name"
							required
							placeholder="prod-fra-01"
							className="h-9 w-full rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
					</div>
					<div className="space-y-1.5">
						<label htmlFor="environment-description" className="text-xs font-medium text-muted">
							Description
						</label>
						<input
							id="environment-description"
							name="description"
							placeholder="Hetzner VM for production"
							className="h-9 w-full rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
					</div>
					<div className="space-y-1.5">
						<label htmlFor="agent-url" className="text-xs font-medium text-muted">
							Agent URL
						</label>
						<div className="flex gap-2">
							<input
								id="agent-url"
								name="agentUrl"
								placeholder="http://agent:9095"
								className="h-9 flex-1 rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
							/>
							<FormSubmitButton
								label="Create"
								pendingLabel="Creating..."
								className="inline-flex h-9 items-center rounded-lg bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
							/>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
