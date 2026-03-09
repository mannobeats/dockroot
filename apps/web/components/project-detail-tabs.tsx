"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StackComposeForm } from "@/components/stack-compose-form";
import { type InstallationOption, StackGitHubForm } from "@/components/stack-github-form";
import { StatusBadge } from "@/components/status-badge";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";
import { TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";

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

function shouldShowRedeploy(stack: Stack) {
	const normalizedStatus = String(stack.status || "").toLowerCase();
	if (
		["running", "healthy", "online", "active", "succeeded"].some((value) =>
			normalizedStatus.includes(value),
		)
	) {
		return true;
	}

	return stack.deployments.some((deployment) => deployment.status === "succeeded");
}

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
			<TabsList>
				{tabs.map((tab) => (
					<TabsTrigger
						key={tab.id}
						active={activeTab === tab.id}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</TabsTrigger>
				))}
			</TabsList>

			{/* Tab content */}
			<TabsPanel>
				{activeTab === "stacks" && (
					<div>
						{project.stacks.length ? (
							<Panel>
								<DataTable>
									<DataTableHeader>
										<tr>
											<DataTableHead>Stack</DataTableHead>
											<DataTableHead>Status</DataTableHead>
											<DataTableHead>Environment</DataTableHead>
											<DataTableHead>Source</DataTableHead>
											<DataTableHead>Actions</DataTableHead>
										</tr>
									</DataTableHeader>
									<DataTableBody>
										{project.stacks.map((stack) => (
											<DataTableRow key={stack.id}>
												<DataTableCell>
													<Link
														href={`/dashboard/projects/${project.id}/stacks/${stack.id}`}
														className="font-medium transition-colors hover:text-foreground/80"
													>
														{stack.name}
													</Link>
													<p className="mt-0.5 text-xs text-muted">
														{stack.description || stack.slug}
													</p>
												</DataTableCell>
												<DataTableCell>
													<StatusBadge status={stack.status} />
												</DataTableCell>
												<DataTableCell className="text-xs text-muted">
													{stack.environment.name}
												</DataTableCell>
												<DataTableCell className="text-xs text-muted">
													{stack.sourceType === "github" ? "GitHub" : "Manual"}
												</DataTableCell>
												<DataTableCell>
													<div className="flex gap-1.5">
														<form action={deployStackAction}>
															<input type="hidden" name="stackId" value={stack.id} />
															<FormSubmitButton
																label={shouldShowRedeploy(stack) ? "Redeploy" : "Deploy"}
																pendingLabel={shouldShowRedeploy(stack) ? "Redeploying..." : "..."}
																size="xs"
															/>
														</form>
														<DestructiveActionModal
															action={destroyStackAction}
															title={`Destroy stack ${stack.name}`}
															description="This will stop and remove the stack resources."
															triggerLabel="Destroy"
															confirmLabel="Destroy"
															pendingLabel="Destroying..."
															triggerVariant="danger"
															triggerSize="xs"
															hiddenFields={{ stackId: stack.id }}
														/>
														<DestructiveActionModal
															action={deleteStackAction}
															title={`Delete stack ${stack.name}`}
															description="This permanently removes stack metadata from Dockroot."
															triggerLabel="Delete"
															confirmLabel="Delete"
															pendingLabel="Deleting..."
															triggerVariant="quietDanger"
															triggerSize="xs"
															hiddenFields={{ stackId: stack.id, projectId: project.id }}
														/>
														<LinkButton
															href={`/dashboard/projects/${project.id}/stacks/${stack.id}`}
															variant="outline"
															size="xs"
														>
															Open <ArrowRight className="ml-1 h-3 w-3" />
														</LinkButton>
													</div>
												</DataTableCell>
											</DataTableRow>
										))}
									</DataTableBody>
								</DataTable>
							</Panel>
						) : (
							<EmptyState
								title="No stacks yet"
								description="Deploy from GitHub or create a manual compose stack."
								actions={
									<>
										<LinkButton
											href="#"
											size="sm"
											onClick={(event) => {
												event.preventDefault();
												setActiveTab("deploy-github");
											}}
										>
											Deploy from GitHub
										</LinkButton>
										<LinkButton
											href="#"
											variant="outline"
											size="sm"
											onClick={(event) => {
												event.preventDefault();
												setActiveTab("deploy-manual");
											}}
										>
											Deploy manually
										</LinkButton>
									</>
								}
							/>
						)}
					</div>
				)}

				{activeTab === "deploy-github" && (
					<Panel padding="md">
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
					</Panel>
				)}

				{activeTab === "deploy-manual" && (
					<Panel padding="md">
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
					</Panel>
				)}
			</TabsPanel>
		</div>
	);
}
