"use client";

import { ChevronDown, ChevronRight, ExternalLink, Package } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { Panel } from "@/components/ui/panel";

type FormAction = (formData: FormData) => void | Promise<void>;

type StackContainer = Record<string, string>;

type TrackedStackRow = {
	type: "tracked";
	slug: string;
	name: string;
	status: string;
	stackId: string;
	environmentName: string;
	sourceType: string;
	containerCount: number;
	runningCount: number;
	containers: StackContainer[];
	lastDeployment: { status: string } | null;
};

type UntrackedStackRow = {
	type: "untracked";
	slug: string;
	name: string;
	status: string;
	stackId: null;
	environmentName: string;
	sourceType: "external";
	containerCount: number;
	runningCount: number;
	containers: StackContainer[];
	configFiles: string[];
	lastDeployment: null;
};

type StackRow = TrackedStackRow | UntrackedStackRow;

function normalizeStatus(status: string) {
	return status.split("(")[0]?.trim().toLowerCase() || "unknown";
}

function isRunningStack(status: string, runningCount: number) {
	return runningCount > 0 || normalizeStatus(status).includes("running");
}

function getContainerName(container: StackContainer) {
	return container.Names || container.Name || container.ID?.slice(0, 12) || "container";
}

function getContainerState(container: StackContainer) {
	return container.State || container.Status || "unknown";
}

function getContainerImage(container: StackContainer) {
	return container.Image || "unknown image";
}

function getPorts(container: StackContainer) {
	const ports = container.Ports || "";
	if (!ports) return "No published ports";
	return ports;
}

export function StacksTableWorkspace({
	stacks,
	includeUntracked,
	environmentId,
	deployStackAction,
	destroyStackAction,
	adoptComposeProjectAction,
	controlComposeProjectAction,
}: {
	stacks: StackRow[];
	includeUntracked: boolean;
	environmentId?: string;
	deployStackAction: FormAction;
	destroyStackAction: FormAction;
	adoptComposeProjectAction: FormAction;
	controlComposeProjectAction: FormAction;
}) {
	const [search, setSearch] = useState("");
	const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

	useEffect(() => {
		function isTypingTarget(target: EventTarget | null) {
			if (!(target instanceof HTMLElement)) {
				return false;
			}
			const tag = target.tagName.toLowerCase();
			return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
				if (isTypingTarget(event.target)) {
					return;
				}
				event.preventDefault();
				const element = document.getElementById("stack-list-search");
				if (element instanceof HTMLInputElement) {
					element.focus();
				}
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const filteredStacks = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) {
			return stacks;
		}
		return stacks.filter((stack) =>
			[stack.name, stack.slug, stack.environmentName || "", stack.status]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [search, stacks]);

	return (
		<div className="space-y-4">
			<Panel padding="sm">
				<div className="flex flex-col gap-3 sm:flex-row">
					<Input
						id="stack-list-search"
						type="search"
						placeholder="Search stacks and environments..."
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className="flex-1"
					/>
					<Button variant="secondary" size="sm" onClick={() => setSearch("")}>
						Clear
					</Button>
				</div>
			</Panel>

			<Panel>
				<DataTable>
					<DataTableHeader>
						<tr>
							<DataTableHead className="w-10" />
							<DataTableHead>Name</DataTableHead>
							<DataTableHead>Status</DataTableHead>
							<DataTableHead>Source</DataTableHead>
							<DataTableHead>Environment</DataTableHead>
							<DataTableHead>Containers</DataTableHead>
							<DataTableHead>Actions</DataTableHead>
						</tr>
					</DataTableHeader>
					<DataTableBody>
						{filteredStacks.length ? (
							filteredStacks.map((stack) => {
								const rowKey = `${stack.type}-${stack.slug}`;
								const expanded = Boolean(expandedRows[rowKey]);
								const detailEnvironmentSuffix = environmentId
									? `?environment=${environmentId}`
									: "";

								return (
									<Fragment key={rowKey}>
										<DataTableRow className="align-top">
											<DataTableCell>
												<button
													type="button"
													onClick={() =>
														setExpandedRows((current) => ({
															...current,
															[rowKey]: !current[rowKey],
														}))
													}
													className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
													aria-label={
														expanded ? "Collapse stack services" : "Expand stack services"
													}
												>
													{expanded ? (
														<ChevronDown className="h-3.5 w-3.5" />
													) : (
														<ChevronRight className="h-3.5 w-3.5" />
													)}
												</button>
											</DataTableCell>
											<DataTableCell>
												<div className="space-y-0.5">
													<p className="font-medium">{stack.name}</p>
													<p className="text-xs text-muted">{stack.slug}</p>
												</div>
											</DataTableCell>
											<DataTableCell>
												<StatusBadge
													status={
														stack.type === "tracked" ? stack.status : normalizeStatus(stack.status)
													}
												/>
											</DataTableCell>
											<DataTableCell className="text-xs text-muted">
												{stack.type === "tracked" ? "Internal" : "Untracked"}
											</DataTableCell>
											<DataTableCell className="text-xs text-muted">
												{stack.environmentName || "—"}
											</DataTableCell>
											<DataTableCell>
												<div className="space-y-0.5">
													<p className="text-sm font-medium">
														{stack.runningCount}/{stack.containerCount}
													</p>
													<p className="text-xs text-muted">
														{stack.lastDeployment?.status || stack.status}
													</p>
												</div>
											</DataTableCell>
											<DataTableCell>
												<div className="flex flex-wrap gap-1.5">
													{stack.type === "tracked" ? (
														<>
															<form action={deployStackAction}>
																<input type="hidden" name="stackId" value={stack.stackId || ""} />
																<FormSubmitButton
																	label={
																		isRunningStack(stack.status, stack.runningCount)
																			? "Redeploy"
																			: "Deploy"
																	}
																	pendingLabel={
																		isRunningStack(stack.status, stack.runningCount)
																			? "Redeploying..."
																			: "Deploying..."
																	}
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
																hiddenFields={{ stackId: stack.stackId || "" }}
															/>
															<LinkButton
																href={`/dashboard/stacks/${stack.stackId}${detailEnvironmentSuffix}`}
																variant="outline"
																size="xs"
															>
																Open
															</LinkButton>
														</>
													) : includeUntracked ? (
														<>
															{isRunningStack(stack.status, stack.runningCount) ? (
																<>
																	<form action={controlComposeProjectAction}>
																		<input type="hidden" name="projectName" value={stack.slug} />
																		<input type="hidden" name="action" value="stop" />
																		{stack.configFiles.map((configFile) => (
																			<input
																				key={`stop-${configFile}`}
																				type="hidden"
																				name="configFiles"
																				value={configFile}
																			/>
																		))}
																		<FormSubmitButton
																			label="Stop"
																			pendingLabel="Stopping..."
																			variant="outline"
																			size="xs"
																		/>
																	</form>
																	<form action={controlComposeProjectAction}>
																		<input type="hidden" name="projectName" value={stack.slug} />
																		<input type="hidden" name="action" value="restart" />
																		{stack.configFiles.map((configFile) => (
																			<input
																				key={`restart-${configFile}`}
																				type="hidden"
																				name="configFiles"
																				value={configFile}
																			/>
																		))}
																		<FormSubmitButton
																			label="Restart"
																			pendingLabel="Restarting..."
																			variant="outline"
																			size="xs"
																		/>
																	</form>
																</>
															) : (
																<form action={controlComposeProjectAction}>
																	<input type="hidden" name="projectName" value={stack.slug} />
																	<input type="hidden" name="action" value="start" />
																	{stack.configFiles.map((configFile) => (
																		<input
																			key={`start-${configFile}`}
																			type="hidden"
																			name="configFiles"
																			value={configFile}
																		/>
																	))}
																	<FormSubmitButton
																		label="Start"
																		pendingLabel="Starting..."
																		variant="outline"
																		size="xs"
																	/>
																</form>
															)}
															<DestructiveActionModal
																action={controlComposeProjectAction}
																title={`Destroy compose stack ${stack.slug}`}
																description="This will run docker compose down for the selected stack."
																triggerLabel="Destroy"
																confirmLabel="Destroy"
																pendingLabel="Destroying..."
																triggerVariant="danger"
																triggerSize="xs"
																hiddenFields={{
																	projectName: stack.slug,
																	action: "destroy",
																	configFiles: stack.configFiles,
																}}
																options={[
																	{
																		name: "removeVolumes",
																		label: "Remove attached volumes",
																		description: "Persistent data may be lost.",
																	},
																	{
																		name: "removeImages",
																		label: "Remove local compose images",
																		description: "Images will be pulled again on next start.",
																	},
																]}
															/>
														</>
													) : null}
													{stack.type === "untracked" && includeUntracked ? (
														<form action={adoptComposeProjectAction}>
															<input type="hidden" name="projectName" value={stack.slug} />
															{stack.configFiles.map((configFile) => (
																<input
																	key={`adopt-${configFile}`}
																	type="hidden"
																	name="configFiles"
																	value={configFile}
																/>
															))}
															<FormSubmitButton
																label="Adopt"
																pendingLabel="Adopting..."
																size="xs"
															/>
														</form>
													) : null}
												</div>
											</DataTableCell>
										</DataTableRow>
										{expanded ? (
											<DataTableRow>
												<DataTableCell colSpan={7}>
													<div className="rounded-xl border border-default/10 bg-background/40 p-3">
														<div className="mb-2 flex items-center justify-between">
															<p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
																Services
															</p>
															<p className="text-xs text-muted">
																{stack.containers.length} container(s)
															</p>
														</div>
														{stack.containers.length ? (
															<div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
																{stack.containers.map((container) => (
																	<div
																		key={`${rowKey}-${container.ID}`}
																		className="rounded-lg border border-default/10 bg-surface p-3"
																	>
																		<div className="flex items-start justify-between gap-2">
																			<div className="min-w-0">
																				<p className="truncate text-sm font-medium">
																					{getContainerName(container)}
																				</p>
																				<p className="truncate text-xs text-muted">
																					{getContainerImage(container)}
																				</p>
																			</div>
																			<StatusBadge status={getContainerState(container)} />
																		</div>
																		<div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
																			<div className="inline-flex min-w-0 flex-1 items-start gap-1">
																				<Package className="h-3.5 w-3.5" />
																				<span
																					className="line-clamp-2 break-all leading-relaxed"
																					title={getPorts(container)}
																				>
																					{getPorts(container)}
																				</span>
																			</div>
																			<LinkButton
																				href={`/dashboard/containers/${container.ID}`}
																				variant="ghost"
																				size="xs"
																				className="shrink-0"
																			>
																				Open
																				<ExternalLink className="h-3 w-3" />
																			</LinkButton>
																		</div>
																	</div>
																))}
															</div>
														) : (
															<p className="text-xs text-muted">
																No container services discovered for this stack.
															</p>
														)}
													</div>
												</DataTableCell>
											</DataTableRow>
										) : null}
									</Fragment>
								);
							})
						) : (
							<DataTableEmpty colSpan={7}>No stacks found.</DataTableEmpty>
						)}
					</DataTableBody>
				</DataTable>
			</Panel>
		</div>
	);
}
