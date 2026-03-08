"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StackComposeForm } from "@/components/stack-compose-form";
import { type InstallationOption, StackGitHubForm } from "@/components/stack-github-form";
import { StatusBadge } from "@/components/status-badge";

type Tab = "stacks" | "deploy-github" | "deploy-manual";

type Environment = { id: string; name: string; kind: string };
type Stack = {
	id: string;
	name: string;
	slug: string;
	status: string;
	description: string | null;
	sourceType: string;
	composeFileName: string;
	envFileName: string | null;
	envFileContent: string | null;
	githubOwner: string | null;
	githubRepository: string | null;
	environment: { name: string };
	deployments: Array<{ id: string; version: string; status: string }>;
};
type Project = {
	id: string;
	name: string;
	stacks: Stack[];
};

type FormAction = (formData: FormData) => void | Promise<void>;

export function ProjectDetailTabs({
	project,
	environments,
	githubInstallations,
	appConfigured,
	createGitHubStackAction,
	createStackAction,
	deployStackAction,
	destroyStackAction,
	deleteStackAction,
}: {
	project: Project;
	environments: Environment[];
	githubInstallations: InstallationOption[];
	appConfigured: boolean;
	createGitHubStackAction: FormAction;
	createStackAction: FormAction;
	deployStackAction: FormAction;
	destroyStackAction: FormAction;
	deleteStackAction: FormAction;
}) {
	const [activeTab, setActiveTab] = useState<Tab>("stacks");

	const tabs: { id: Tab; label: string }[] = [
		{ id: "stacks", label: `Stacks (${project.stacks.length})` },
		{ id: "deploy-github", label: "Deploy from GitHub" },
		{ id: "deploy-manual", label: "Deploy manually" },
	];

	return (
		<div>
			{/* Tab navigation */}
			<div className="tab-nav">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						data-active={activeTab === tab.id}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Tab content */}
			<div className="mt-6">
				{activeTab === "stacks" && (
					<div>
						{project.stacks.length ? (
							<div className="rounded-xl border border-default/10 bg-surface">
								<div className="table-scroll">
									<table className="min-w-full text-left text-sm">
										<thead>
											<tr className="border-b border-default/10 text-xs text-muted">
												<th className="px-4 py-3 font-medium">Stack</th>
												<th className="px-4 py-3 font-medium">Status</th>
												<th className="px-4 py-3 font-medium">Environment</th>
												<th className="px-4 py-3 font-medium">Source</th>
												<th className="px-4 py-3 font-medium">Actions</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-default/5">
											{project.stacks.map((stack) => (
												<tr key={stack.id} className="transition-colors hover:bg-foreground/[0.02]">
													<td className="px-4 py-3">
														<Link
															href={`/dashboard/projects/${project.id}/stacks/${stack.id}`}
															className="font-medium transition-colors hover:text-foreground/80"
														>
															{stack.name}
														</Link>
														<p className="mt-0.5 text-xs text-muted">
															{stack.description || stack.slug}
														</p>
													</td>
													<td className="px-4 py-3">
														<StatusBadge status={stack.status} />
													</td>
													<td className="px-4 py-3 text-xs text-muted">{stack.environment.name}</td>
													<td className="px-4 py-3 text-xs text-muted">
														{stack.sourceType === "github" ? "GitHub" : "Manual"}
													</td>
													<td className="px-4 py-3">
														<div className="flex gap-1.5">
															<form action={deployStackAction}>
																<input type="hidden" name="stackId" value={stack.id} />
																<FormSubmitButton
																	label="Deploy"
																	pendingLabel="..."
																	className="inline-flex h-7 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
																/>
															</form>
															<form action={destroyStackAction}>
																<input type="hidden" name="stackId" value={stack.id} />
																<FormSubmitButton
																	label="Destroy"
																	pendingLabel="..."
																	className="inline-flex h-7 items-center rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
																/>
															</form>
															<form action={deleteStackAction}>
																<input type="hidden" name="stackId" value={stack.id} />
																<input type="hidden" name="projectId" value={project.id} />
																<FormSubmitButton
																	label="Delete"
																	pendingLabel="..."
																	className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-red-600"
																/>
															</form>
															<Link
																href={`/dashboard/projects/${project.id}/stacks/${stack.id}`}
																className="inline-flex h-7 items-center rounded-md border border-default/10 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
															>
																Open <ArrowRight className="ml-1 h-3 w-3" />
															</Link>
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						) : (
							<div className="rounded-xl border border-dashed border-default/10 bg-surface p-12 text-center">
								<p className="text-sm text-muted">No stacks yet.</p>
								<p className="mt-1 text-xs text-muted">
									Deploy from GitHub or create a manual compose stack.
								</p>
								<div className="mt-4 flex justify-center gap-2">
									<button
										type="button"
										onClick={() => setActiveTab("deploy-github")}
										className="inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background"
									>
										Deploy from GitHub
									</button>
									<button
										type="button"
										onClick={() => setActiveTab("deploy-manual")}
										className="inline-flex h-8 items-center rounded-md border border-default/10 px-3 text-xs font-medium text-muted"
									>
										Deploy manually
									</button>
								</div>
							</div>
						)}
					</div>
				)}

				{activeTab === "deploy-github" && (
					<div className="rounded-xl border border-default/10 bg-surface p-5">
						<div className="mb-4">
							<h2 className="text-base font-semibold">Deploy from GitHub</h2>
							<p className="mt-1 text-sm text-muted">
								Connect a repository, choose a compose path, and review before deploying.
							</p>
						</div>
						<StackGitHubForm
							projectId={project.id}
							environments={environments}
							installations={githubInstallations}
							redirectTo={`/dashboard/projects/${project.id}`}
							appConfigured={appConfigured}
							action={createGitHubStackAction}
						/>
					</div>
				)}

				{activeTab === "deploy-manual" && (
					<div className="rounded-xl border border-default/10 bg-surface p-5">
						<div className="mb-4">
							<h2 className="text-base font-semibold">Deploy manually</h2>
							<p className="mt-1 text-sm text-muted">
								Paste compose and env content to create a stack without GitHub.
							</p>
						</div>
						<StackComposeForm
							projectId={project.id}
							environments={environments}
							action={createStackAction}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
