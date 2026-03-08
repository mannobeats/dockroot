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
		<div className="space-y-6">
			<PageHeader
				kicker="Environments"
				title="Servers and agents"
				description="The manager host is available instantly. Remote environments generate install commands automatically so you can paste once and bring the server online."
			/>

			<div className="grid gap-5 xl:grid-cols-[1fr_380px]">
				<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
					<div className="space-y-4">
						{environments.map((environment) => {
							const agent = environment.agent[0];
							const commands = installMap.get(environment.id);

							return (
								<div
									key={environment.id}
									className="rounded-[24px] border border-default/15 bg-background/60 p-5"
								>
									<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
										<div>
											<div className="flex flex-wrap items-center gap-2">
												<h2 className="text-lg font-semibold">{environment.name}</h2>
												<StatusBadge status={environment.status} />
											</div>
											<p className="mt-1 text-sm text-muted">
												{environment.description || "No environment description yet."}
											</p>
										</div>
										<Link
											href={`/dashboard/environments/${environment.id}`}
											className="inline-flex h-10 items-center justify-center rounded-xl border border-default/15 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/30 hover:text-accent"
										>
											Open
										</Link>
									</div>

									<div className="mt-4 grid gap-4 lg:grid-cols-3">
										<div className="rounded-2xl border border-default/15 bg-surface/50 p-4">
											<p className="text-xs text-muted">Kind</p>
											<p className="mt-2 text-sm font-semibold capitalize">{environment.kind}</p>
										</div>
										<div className="rounded-2xl border border-default/15 bg-surface/50 p-4">
											<p className="text-xs text-muted">Stacks</p>
											<p className="mt-2 text-sm font-semibold">{environment.stacks.length}</p>
										</div>
										<div className="rounded-2xl border border-default/15 bg-surface/50 p-4">
											<p className="text-xs text-muted">Agent host</p>
											<p className="mt-2 text-sm font-semibold">
												{agent?.hostname || "Awaiting registration"}
											</p>
										</div>
									</div>

									{environment.kind === "agent" && commands ? (
										<div className="mt-4 space-y-4">
											<div className="rounded-2xl border border-default/15 bg-[#050914] p-4">
												<div className="flex items-center justify-between gap-3">
													<p className="text-sm font-semibold text-white">Agent env</p>
													<CopyButton value={commands.envContent} />
												</div>
												<pre className="mt-3 overflow-auto text-xs leading-6 text-white/80">
													{commands.envContent}
												</pre>
											</div>
											<div className="grid gap-4 xl:grid-cols-2">
												<div className="rounded-2xl border border-default/15 bg-[#050914] p-4">
													<div className="flex items-center justify-between gap-3">
														<p className="text-sm font-semibold text-white">Docker Compose</p>
														<CopyButton value={commands.dockerCompose} />
													</div>
													<pre className="mt-3 overflow-auto text-xs leading-6 text-white/80">
														{commands.dockerCompose}
													</pre>
												</div>
												<div className="rounded-2xl border border-default/15 bg-[#050914] p-4">
													<div className="flex items-center justify-between gap-3">
														<p className="text-sm font-semibold text-white">Docker Run</p>
														<CopyButton value={commands.dockerRun} />
													</div>
													<pre className="mt-3 overflow-auto text-xs leading-6 text-white/80">
														{commands.dockerRun}
													</pre>
												</div>
											</div>
										</div>
									) : null}
								</div>
							);
						})}
					</div>
				</section>

				<section className="rounded-[28px] border border-default/15 bg-surface/80 p-5">
					<h2 className="text-lg font-semibold tracking-tight">Add remote environment</h2>
					<p className="mt-1 text-sm text-muted">
						Create an environment, then deploy the Dockroot agent on the target server with Docker
						Compose or docker run. The agent will keep its state on disk, survive restarts, and poll
						for deployments automatically.
					</p>
					<form action={createEnvironmentAction} className="mt-5 space-y-4">
						<div className="space-y-1.5">
							<label htmlFor="environment-name" className="text-sm font-medium">
								Environment name
							</label>
							<input
								id="environment-name"
								name="name"
								required
								placeholder="prod-fra-01"
								className="h-11 w-full rounded-2xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="environment-description" className="text-sm font-medium">
								Description
							</label>
							<textarea
								id="environment-description"
								name="description"
								rows={4}
								placeholder="Hetzner VM for production workloads."
								className="w-full rounded-2xl border border-default/15 bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-accent"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor="manager-url" className="text-sm font-medium">
								Public manager URL
							</label>
							<input
								id="manager-url"
								name="managerUrl"
								placeholder="https://dockroot.example.com"
								className="h-11 w-full rounded-2xl border border-default/15 bg-background px-4 text-sm outline-none transition-colors focus:border-accent"
							/>
						</div>
						<FormSubmitButton label="Create environment" pendingLabel="Creating environment..." />
					</form>
				</section>
			</div>
		</div>
	);
}
