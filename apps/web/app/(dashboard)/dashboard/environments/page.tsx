import Link from "next/link";
import { createEnvironmentAction } from "@/app/(dashboard)/actions";
import { CopyButton } from "@/components/copy-button";
import { FormSubmitButton } from "@/components/form-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getInstallCommand, listEnvironments } from "@/lib/platform";
import { getServerSession } from "@/lib/session";

export default async function EnvironmentsPage() {
	const session = await getServerSession();

	if (!session?.user.id) {
		return null;
	}

	const environments = await listEnvironments(session.user.id);
	const installCommands = await Promise.all(
		environments
			.filter((environment) => environment.kind === "agent")
			.map(async (environment) => ({
				environmentId: environment.id,
				commands: await getInstallCommand(environment.id, session.user.id),
			})),
	);

	const installMap = new Map(installCommands.map((entry) => [entry.environmentId, entry.commands]));

	return (
		<div className="animate-in space-y-6">
			<PageHeader
				kicker="Infrastructure"
				title="Environments"
				description={`${environments.length} environments — local Docker host and remote agents`}
			/>

			<div className="grid gap-6 xl:grid-cols-[1fr_380px]">
				{/* Environment List */}
				<div className="space-y-4">
					{environments.map((environment) => {
						const agent = environment.agent[0];
						const commands = installMap.get(environment.id);

						return (
							<div
								key={environment.id}
								className="rounded-xl border border-default/10 bg-surface p-5"
							>
								<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div>
										<div className="flex items-center gap-2">
											<h2 className="text-base font-semibold">{environment.name}</h2>
											<StatusBadge status={environment.status} />
										</div>
										<p className="mt-1 text-sm text-muted">
											{environment.description || "No description"}
										</p>
									</div>
									<div className="flex gap-2">
										<Link
											href={`/dashboard?environment=${environment.id}`}
											className="inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
										>
											Open
										</Link>
										<Link
											href={`/dashboard/environments/${environment.id}`}
											className="inline-flex h-8 items-center rounded-lg border border-default/10 px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
										>
											Details
										</Link>
									</div>
								</div>

								<div className="mt-4 grid gap-3 sm:grid-cols-3">
									<div className="rounded-lg bg-foreground/[0.02] p-3">
										<p className="text-xs text-muted">Kind</p>
										<p className="mt-1 text-sm font-medium capitalize">{environment.kind}</p>
									</div>
									<div className="rounded-lg bg-foreground/[0.02] p-3">
										<p className="text-xs text-muted">Stacks</p>
										<p className="mt-1 text-sm font-medium">{environment.stacks.length}</p>
									</div>
									<div className="rounded-lg bg-foreground/[0.02] p-3">
										<p className="text-xs text-muted">Agent host</p>
										<p className="mt-1 text-sm font-medium">
											{agent?.hostname || "Awaiting registration"}
										</p>
									</div>
								</div>

								{environment.kind === "agent" && commands ? (
									<div className="mt-4 grid gap-3 xl:grid-cols-2">
										<div className="rounded-lg border border-default/10 bg-[#0a0a0a] p-4">
											<div className="flex items-center justify-between gap-3">
												<p className="text-xs font-medium text-white/60">Docker Compose</p>
												<CopyButton value={commands.dockerCompose} />
											</div>
											<pre className="mt-2 overflow-auto text-xs leading-5 text-white/80">
												{commands.dockerCompose}
											</pre>
										</div>
										<div className="rounded-lg border border-default/10 bg-[#0a0a0a] p-4">
											<div className="flex items-center justify-between gap-3">
												<p className="text-xs font-medium text-white/60">Docker Run</p>
												<CopyButton value={commands.dockerRun} />
											</div>
											<pre className="mt-2 overflow-auto text-xs leading-5 text-white/80">
												{commands.dockerRun}
											</pre>
										</div>
									</div>
								) : null}
							</div>
						);
					})}
				</div>

				{/* Create Remote Environment */}
				<div className="rounded-xl border border-default/10 bg-surface p-5">
					<h2 className="text-sm font-semibold">Add environment</h2>
					<p className="mt-1 text-xs text-muted">
						Create a remote environment and deploy the Dockroot agent.
					</p>
					<form action={createEnvironmentAction} className="mt-4 space-y-4">
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
							<textarea
								id="environment-description"
								name="description"
								rows={3}
								placeholder="Hetzner VM for production workloads."
								className="w-full rounded-lg border border-default/10 bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="agent-url" className="text-xs font-medium text-muted">
								Agent URL
							</label>
							<input
								id="agent-url"
								name="agentUrl"
								placeholder="http://agent.example.com:9095"
								className="h-9 w-full rounded-lg border border-default/10 bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
							/>
						</div>
						<FormSubmitButton
							label="Create environment"
							pendingLabel="Creating..."
							className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
						/>
					</form>
				</div>
			</div>
		</div>
	);
}
