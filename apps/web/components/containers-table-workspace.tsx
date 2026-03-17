"use client";

import {
	ArrowUpCircle,
	Columns3,
	ExternalLink,
	Lock,
	Logs as LogsIcon,
	PanelRightClose,
	PanelRightOpen,
	Play,
	RefreshCw,
	Square,
	SquareTerminal,
	TerminalSquare,
	Trash2,
	X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DestructiveActionModal } from "@/components/destructive-action-modal";
import { FormSubmitButton } from "@/components/form-submit-button";
import { LiveStackFeed } from "@/components/live-stack-feed";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/link-button";
import { PopoverCard } from "@/components/ui/popover-card";
import { getSocket } from "@/lib/socket-client";

type FormAction = (formData: FormData) => void | Promise<void>;

type ContainerRow = Record<string, string>;

/** Per-container live stats from docker stats */
type ContainerStats = {
	CPUPerc?: string;
	MemPerc?: string;
	MemUsage?: string;
	NetIO?: string;
	BlockIO?: string;
	PIDs?: string;
};

type RuntimePayload = {
	at: number;
	containers: Array<{
		Name?: string;
		CPUPerc?: string;
		MemPerc?: string;
		MemUsage?: string;
		NetIO?: string;
		BlockIO?: string;
		PIDs?: string;
	}>;
};

// Column definitions
type ColumnId =
	| "name"
	| "image"
	| "state"
	| "cpu"
	| "memory"
	| "uptime"
	| "netio"
	| "ports"
	| "stack"
	| "updates"
	| "actions";

type ColumnDef = {
	id: ColumnId;
	label: string;
	defaultVisible: boolean;
	alwaysVisible?: boolean;
};

const ALL_COLUMNS: ColumnDef[] = [
	{ id: "name", label: "Name", defaultVisible: true, alwaysVisible: true },
	{ id: "image", label: "Image", defaultVisible: true },
	{ id: "state", label: "State", defaultVisible: true },
	{ id: "cpu", label: "CPU", defaultVisible: true },
	{ id: "memory", label: "Memory", defaultVisible: true },
	{ id: "uptime", label: "Uptime", defaultVisible: true },
	{ id: "netio", label: "Net I/O", defaultVisible: false },
	{ id: "ports", label: "Ports", defaultVisible: true },
	{ id: "stack", label: "Stack", defaultVisible: true },
	{ id: "updates", label: "Updates", defaultVisible: false },
	{ id: "actions", label: "Actions", defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = "dockroot:containers:columns";

function getInitialColumns(): Set<ColumnId> {
	if (typeof window !== "undefined") {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as ColumnId[];
				if (Array.isArray(parsed) && parsed.length > 0) {
					const set = new Set(parsed);
					// Always ensure required columns
					for (const col of ALL_COLUMNS) {
						if (col.alwaysVisible) set.add(col.id);
					}
					return set;
				}
			}
		} catch { /* ignore */ }
	}
	return new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id));
}

function summarizeComposeProject(labels: string | undefined) {
	if (!labels) return "";
	return (
		labels
			.split(",")
			.find((entry) => entry.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=") || ""
	);
}

function latestRefForMajorUpgrade(imageRef: string) {
	const value = (imageRef || "").trim();
	if (!value || value.includes("@")) return null;
	const lastSlash = value.lastIndexOf("/");
	const lastColon = value.lastIndexOf(":");
	if (lastColon <= lastSlash) return null;
	const repository = value.slice(0, lastColon);
	const tag = value.slice(lastColon + 1);
	if (!repository || !tag || tag === "latest") return null;
	return `${repository}:latest`;
}

function tagFromImageRef(imageRef: string) {
	const value = (imageRef || "").trim();
	if (!value || value.includes("@")) return null;
	const lastSlash = value.lastIndexOf("/");
	const lastColon = value.lastIndexOf(":");
	if (lastColon <= lastSlash) return null;
	return value.slice(lastColon + 1);
}

function parsePercent(value: string | undefined): number {
	return Number.parseFloat((value || "0").replace("%", "")) || 0;
}

function extractUptime(status: string): string {
	if (!status) return "—";
	const match = status.match(/^Up\s+(.+?)(?:\s*\(.*\))?$/i);
	return match ? match[1] : "—";
}

function formatCpu(value: number): string {
	return `${value.toFixed(1)}%`;
}

function formatMemory(memUsage: string | undefined, memPerc: string | undefined): { usage: string; percent: number } {
	const percent = parsePercent(memPerc);
	if (memUsage) {
		const parts = memUsage.split("/");
		return { usage: parts[0]?.trim() || "—", percent };
	}
	return { usage: "—", percent };
}

function CpuBar({ percent }: { percent: number }) {
	const color =
		percent > 80 ? "bg-danger" : percent > 50 ? "bg-warning" : "bg-accent";
	return (
		<div className="flex items-center gap-1.5 min-w-[80px]">
			<span className="font-mono text-[11px] tabular-nums w-[38px] text-right">
				{formatCpu(percent)}
			</span>
			<div className="flex-1 h-1 rounded-full bg-default/10 overflow-hidden">
				<div
					className={`h-full rounded-full transition-all duration-500 ${color}`}
					style={{ width: `${Math.min(percent, 100)}%` }}
				/>
			</div>
		</div>
	);
}

function MemoryBar({ usage, percent }: { usage: string; percent: number }) {
	const color =
		percent > 85 ? "bg-danger" : percent > 60 ? "bg-warning" : "bg-success";
	return (
		<div className="min-w-[90px]">
			<div className="flex items-center gap-1.5">
				<span className="font-mono text-[11px] tabular-nums w-[55px] text-right truncate">
					{usage}
				</span>
				<div className="flex-1 h-1 rounded-full bg-default/10 overflow-hidden">
					<div
						className={`h-full rounded-full transition-all duration-500 ${color}`}
						style={{ width: `${Math.min(percent, 100)}%` }}
					/>
				</div>
			</div>
		</div>
	);
}

export function ContainersTableWorkspace({
	containers,
	environmentId,
	managerUrl,
	controlContainerAction,
	bulkControlContainerAction,
	checkContainerUpdatesAction,
	bulkCheckContainerUpdatesAction,
	applyContainerUpdatesAction,
	bulkApplyContainerUpdatesAction,
	setContainerUpdatePolicyAction,
	protectedContainerIds,
	protectedContainerLabels,
	initialWatchStackId,
	updatePolicyMap,
	updateStateMap,
}: {
	containers: ContainerRow[];
	environmentId: string;
	managerUrl?: string;
	controlContainerAction: FormAction;
	bulkControlContainerAction: FormAction;
	checkContainerUpdatesAction: FormAction;
	bulkCheckContainerUpdatesAction: FormAction;
	applyContainerUpdatesAction: FormAction;
	bulkApplyContainerUpdatesAction: FormAction;
	setContainerUpdatePolicyAction: FormAction;
	protectedContainerIds: string[];
	protectedContainerLabels: Record<string, string>;
	initialWatchStackId?: string;
	updatePolicyMap: Record<
		string,
		{
			checkEnabled: boolean;
			updateEnabled: boolean;
		}
	>;
	updateStateMap: Record<
		string,
		{
			updateAvailable: boolean;
			majorUpdateAvailable: boolean;
			majorTargetImageRef?: string | null;
			majorTargetTag?: string | null;
			lastResult: string | null;
			lastError?: string | null;
			checkedAt: string | Date | null;
			updatedAt: string | Date | null;
		}
	>;
}) {
	const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
	const [watchStackId, setWatchStackId] = useState(initialWatchStackId || "");
	const [logDockOpen, setLogDockOpen] = useState(Boolean(initialWatchStackId));
	const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(getInitialColumns);
	const [columnMenuOpen, setColumnMenuOpen] = useState(false);
	const columnMenuRef = useRef<HTMLDivElement>(null);

	// Per-container live stats from socket
	const [containerStats, setContainerStats] = useState<Record<string, ContainerStats>>({});

	const protectedSet = useMemo(() => new Set(protectedContainerIds), [protectedContainerIds]);
	const selectableIds = useMemo(
		() => containers.map((container) => container.ID).filter((id) => !protectedSet.has(id)),
		[containers, protectedSet],
	);
	const selectedContainers = useMemo(
		() => containers.filter((container) => selectedIds[container.ID]),
		[containers, selectedIds],
	);
	const selectedPayload = selectedContainers.map((container) => container.ID);
	const selectedRunning = selectedContainers.filter(
		(container) => (container.State || "").toLowerCase() === "running",
	);
	const selectedStopped = selectedContainers.filter(
		(container) => (container.State || "").toLowerCase() !== "running",
	);
	const allSelectableSelected =
		selectableIds.length > 0 && selectableIds.every((containerId) => selectedIds[containerId]);

	// Column toggle persistence
	const toggleColumn = useCallback(
		(columnId: ColumnId) => {
			const col = ALL_COLUMNS.find((c) => c.id === columnId);
			if (col?.alwaysVisible) return;
			setVisibleColumns((prev) => {
				const next = new Set(prev);
				if (next.has(columnId)) {
					next.delete(columnId);
				} else {
					next.add(columnId);
				}
				try {
					localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
				} catch { /* ignore */ }
				return next;
			});
		},
		[],
	);

	// Close column menu on outside click
	useEffect(() => {
		if (!columnMenuOpen) return;
		const onClick = (e: MouseEvent) => {
			if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
				setColumnMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", onClick);
		return () => document.removeEventListener("mousedown", onClick);
	}, [columnMenuOpen]);

	// Listen to socket for per-container stats
	useEffect(() => {
		const client = getSocket();

		const onMetrics = (payload: RuntimePayload) => {
			const statsMap: Record<string, ContainerStats> = {};
			for (const c of payload.containers) {
				if (c.Name) {
					// Docker stats name may have leading slash or compose suffix
					const name = c.Name.replace(/^\//, "");
					statsMap[name] = {
						CPUPerc: c.CPUPerc,
						MemPerc: c.MemPerc,
						MemUsage: c.MemUsage,
						NetIO: c.NetIO,
						BlockIO: c.BlockIO,
						PIDs: c.PIDs,
					};
				}
			}
			setContainerStats(statsMap);
		};

		const onDeploymentUpdate = (event: { stackId?: string; status?: string }) => {
			if (!event?.stackId) return;
			if (event.status === "running" || event.status === "queued") {
				setWatchStackId(event.stackId);
				setLogDockOpen(true);
			}
		};

		client.on("runtime:metrics", onMetrics);
		client.on("deployment:update", onDeploymentUpdate);
		return () => {
			client.off("runtime:metrics", onMetrics);
			client.off("deployment:update", onDeploymentUpdate);
		};
	}, []);

	const isVisible = (id: ColumnId) => visibleColumns.has(id);
	const visibleCount = ALL_COLUMNS.filter((c) => visibleColumns.has(c.id)).length + 1; // +1 for checkbox

	return (
		<>
			<div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-default/8 px-3 py-2">
				<p className="mr-2 text-xs text-muted">
					{selectedContainers.length
						? `${selectedContainers.length} selected`
						: "Select one or more containers"}
				</p>
				<form
					action={bulkCheckContainerUpdatesAction}
					onSubmit={() => setSelectedIds({})}
				>
					{selectedContainers.map((container) => (
						<input key={`check-${container.ID}`} type="hidden" name="containerIds" value={container.ID} />
					))}
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label={`Check updates${selectedContainers.length ? ` (${selectedContainers.length})` : ""}`}
						pendingLabel="Checking..."
						size="xs"
						variant="outline"
						disabled={!selectedContainers.length}
					/>
				</form>
				<form
					action={bulkApplyContainerUpdatesAction}
					onSubmit={() => setSelectedIds({})}
				>
					{selectedContainers.map((container) => (
						<input key={`apply-${container.ID}`} type="hidden" name="containerIds" value={container.ID} />
					))}
					<input type="hidden" name="environmentId" value={environmentId} />
					<input type="hidden" name="updateOnlyRunning" value="true" />
					<FormSubmitButton
						label={`Update${selectedContainers.length ? ` (${selectedContainers.length})` : ""}`}
						pendingLabel="Queueing..."
						size="xs"
						variant="secondary"
						disabled={!selectedContainers.length}
					/>
				</form>
				<form action={bulkControlContainerAction} onSubmit={() => setSelectedIds({})}>
					{selectedStopped.map((container) => (
						<input key={`start-${container.ID}`} type="hidden" name="containerIds" value={container.ID} />
					))}
					<input type="hidden" name="action" value="start" />
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label={`Start${selectedStopped.length ? ` (${selectedStopped.length})` : ""}`}
						pendingLabel="Starting..."
						size="xs"
						variant="outline"
						disabled={!selectedStopped.length}
					/>
				</form>
				<form action={bulkControlContainerAction} onSubmit={() => setSelectedIds({})}>
					{selectedRunning.map((container) => (
						<input key={`stop-${container.ID}`} type="hidden" name="containerIds" value={container.ID} />
					))}
					<input type="hidden" name="action" value="stop" />
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label={`Stop${selectedRunning.length ? ` (${selectedRunning.length})` : ""}`}
						pendingLabel="Stopping..."
						size="xs"
						variant="outline"
						disabled={!selectedRunning.length}
					/>
				</form>
				<form action={bulkControlContainerAction} onSubmit={() => setSelectedIds({})}>
					{selectedRunning.map((container) => (
						<input key={`restart-${container.ID}`} type="hidden" name="containerIds" value={container.ID} />
					))}
					<input type="hidden" name="action" value="restart" />
					<input type="hidden" name="environmentId" value={environmentId} />
					<FormSubmitButton
						label={`Restart${selectedRunning.length ? ` (${selectedRunning.length})` : ""}`}
						pendingLabel="Restarting..."
						size="xs"
						variant="outline"
						disabled={!selectedRunning.length}
					/>
				</form>
				<DestructiveActionModal
					action={bulkControlContainerAction}
					onConfirm={() => setSelectedIds({})}
					title={`Remove ${selectedContainers.length} container(s)`}
					description="This permanently removes all selected containers."
					triggerLabel={`Remove${selectedContainers.length ? ` (${selectedContainers.length})` : ""}`}
					confirmLabel="Remove all"
					pendingLabel="Removing..."
					triggerVariant="danger"
					triggerSize="xs"
					disabled={!selectedContainers.length}
					hiddenFields={{
						containerIds: selectedPayload,
						action: "remove",
						environmentId,
					}}
					options={[
						{
							name: "removeVolumes",
							label: "Remove anonymous volumes",
							description: "Data in attached anonymous volumes will be lost.",
						},
					]}
				/>
				<button
					type="button"
					onClick={() => setSelectedIds({})}
					disabled={!selectedContainers.length}
					className="ml-auto text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
				>
					Clear
				</button>

				{/* Column toggle */}
				<div className="relative" ref={columnMenuRef}>
					<button
						type="button"
						onClick={() => setColumnMenuOpen((o) => !o)}
						className="inline-flex h-7 items-center gap-1.5 rounded-md border border-default/15 px-2.5 text-xs text-muted transition-colors hover:border-default/25 hover:text-foreground"
						title="Toggle columns"
					>
						<Columns3 className="h-3.5 w-3.5" />
						Columns
					</button>
					{columnMenuOpen ? (
						<div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-default/15 bg-surface shadow-[var(--shadow-lg)] py-1">
							{ALL_COLUMNS.map((col) => (
								<label
									key={col.id}
									className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-foreground/[0.04] ${
										col.alwaysVisible ? "opacity-50 cursor-not-allowed" : ""
									}`}
								>
									<input
										type="checkbox"
										checked={visibleColumns.has(col.id)}
										disabled={col.alwaysVisible}
										onChange={() => toggleColumn(col.id)}
										className="h-3 w-3 rounded border-default/30 accent-accent"
									/>
									{col.label}
								</label>
							))}
						</div>
					) : null}
				</div>

				<button
					type="button"
					onClick={() => setLogDockOpen((open) => !open)}
					disabled={!watchStackId}
					className="inline-flex h-7 items-center gap-1.5 rounded-md border border-default/15 px-2.5 text-xs text-muted transition-colors hover:border-default/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
					title="Toggle live deploy console"
				>
					{logDockOpen ? (
						<PanelRightClose className="h-3.5 w-3.5" />
					) : (
						<PanelRightOpen className="h-3.5 w-3.5" />
					)}
					Console
				</button>
			</div>

			<DataTable>
				<DataTableHeader>
					<tr>
						<DataTableHead className="w-8">
							<input
								type="checkbox"
								aria-label="Select all containers"
								checked={allSelectableSelected}
								onChange={(event) => {
									if (!event.target.checked) {
										setSelectedIds({});
										return;
									}
									setSelectedIds((current) => ({
										...current,
										...Object.fromEntries(selectableIds.map((id) => [id, true])),
									}));
								}}
								className="h-3.5 w-3.5 rounded border-default/30 bg-background"
							/>
						</DataTableHead>
						{isVisible("name") ? <DataTableHead>Name</DataTableHead> : null}
						{isVisible("image") ? <DataTableHead>Image</DataTableHead> : null}
						{isVisible("state") ? <DataTableHead>State</DataTableHead> : null}
						{isVisible("cpu") ? <DataTableHead>CPU</DataTableHead> : null}
						{isVisible("memory") ? <DataTableHead>Memory</DataTableHead> : null}
						{isVisible("uptime") ? <DataTableHead>Uptime</DataTableHead> : null}
						{isVisible("netio") ? <DataTableHead>Net I/O</DataTableHead> : null}
						{isVisible("ports") ? <DataTableHead>Ports</DataTableHead> : null}
						{isVisible("stack") ? <DataTableHead>Stack</DataTableHead> : null}
						{isVisible("updates") ? <DataTableHead>Updates</DataTableHead> : null}
						{isVisible("actions") ? (
							<DataTableHead className="w-24 text-right">Actions</DataTableHead>
						) : null}
					</tr>
				</DataTableHeader>
				<DataTableBody>
					{containers.length ? (
						containers.map((container) => {
							const state = (container.State || "").toLowerCase();
							const isRunning = state === "running";
							const composeProject = summarizeComposeProject(container.Labels);
							const isProtected = protectedSet.has(container.ID);
							const protectedLabel = protectedContainerLabels[container.ID] || "";
							const containerName = container.Names || container.Name || "";
							const updatePolicy = updatePolicyMap[containerName];
							const updateState = updateStateMap[containerName];
							const checkEnabled = updatePolicy?.checkEnabled ?? true;
							const updateEnabled = updatePolicy?.updateEnabled ?? false;
							const updateAvailable = Boolean(updateState?.updateAvailable);
							const majorUpdateAvailable = Boolean(updateState?.majorUpdateAvailable);
							const checkFailed = !isProtected && updateState?.lastResult === "check_failed";
							const majorTargetImageRef =
								(updateState?.majorTargetImageRef || "").trim() ||
								latestRefForMajorUpgrade(container.Image || "");
							const majorTargetTag =
								(updateState?.majorTargetTag || "").trim() ||
								tagFromImageRef(majorTargetImageRef || "") ||
								"latest";

							// Live stats for this container
							const stats = containerStats[containerName] || {};
							const cpuPercent = parsePercent(stats.CPUPerc);
							const { usage: memUsage, percent: memPercent } = formatMemory(
								stats.MemUsage,
								stats.MemPerc,
							);
							const uptime = isRunning ? extractUptime(container.Status || "") : "—";

							return (
								<DataTableRow key={`${container.ID}-${container.Names}`}>
									<DataTableCell>
										<input
											type="checkbox"
											aria-label={`Select ${container.Names}`}
											disabled={isProtected}
											checked={Boolean(selectedIds[container.ID])}
											onChange={(event) =>
												setSelectedIds((current) => ({
													...current,
													[container.ID]: event.target.checked,
												}))
											}
											className="h-3.5 w-3.5 rounded border-default/30 bg-background"
										/>
									</DataTableCell>

									{/* NAME */}
									{isVisible("name") ? (
										<DataTableCell>
											<div className="flex items-center gap-1.5">
												<Link
													href={`/dashboard/containers/${container.ID}?environment=${environmentId}`}
													className="font-medium transition-colors hover:text-accent"
												>
													{container.Names}
												</Link>
												{isProtected ? (
													<Badge title={protectedLabel || undefined} variant="warning">
														<Lock className="h-2.5 w-2.5" />
													</Badge>
												) : null}
											</div>
											{composeProject ? (
												<p className="text-[11px] text-muted">{composeProject}</p>
											) : null}
										</DataTableCell>
									) : null}

									{/* IMAGE */}
									{isVisible("image") ? (
										<DataTableCell className="max-w-[180px] truncate text-xs text-muted">
											{container.Image}
										</DataTableCell>
									) : null}

									{/* STATE */}
									{isVisible("state") ? (
										<DataTableCell>
											<div className="space-y-0.5">
												<StatusBadge status={state || "offline"} />
												{container.HealthStatus ? (
													<StatusBadge status={container.HealthStatus} />
												) : null}
											</div>
										</DataTableCell>
									) : null}

									{/* CPU */}
									{isVisible("cpu") ? (
										<DataTableCell>
											{isRunning ? (
												<CpuBar percent={cpuPercent} />
											) : (
												<span className="text-xs text-muted/50">—</span>
											)}
										</DataTableCell>
									) : null}

									{/* MEMORY */}
									{isVisible("memory") ? (
										<DataTableCell>
											{isRunning ? (
												<MemoryBar usage={memUsage} percent={memPercent} />
											) : (
												<span className="text-xs text-muted/50">—</span>
											)}
										</DataTableCell>
									) : null}

									{/* UPTIME */}
									{isVisible("uptime") ? (
										<DataTableCell className="text-xs text-muted whitespace-nowrap">
											{uptime}
										</DataTableCell>
									) : null}

									{/* NET I/O */}
									{isVisible("netio") ? (
										<DataTableCell className="text-xs text-muted whitespace-nowrap font-mono">
											{isRunning && stats.NetIO ? stats.NetIO : "—"}
										</DataTableCell>
									) : null}

									{/* PORTS */}
									{isVisible("ports") ? (
										<DataTableCell>
											<RuntimePortLinks
												ports={container.Ports}
												compact
												managerUrl={managerUrl}
											/>
										</DataTableCell>
									) : null}

									{/* STACK */}
									{isVisible("stack") ? (
										<DataTableCell className="text-xs text-muted">
											{composeProject || "—"}
										</DataTableCell>
									) : null}

									{/* UPDATES */}
									{isVisible("updates") ? (
										<DataTableCell>
											<div className="space-y-1 text-[11px]">
												<div className="flex items-center gap-1">
													<form action={setContainerUpdatePolicyAction}>
														<input type="hidden" name="environmentId" value={environmentId} />
														<input type="hidden" name="containerName" value={containerName} />
														<input type="hidden" name="mode" value="check" />
														<input
															type="hidden"
															name="enabled"
															value={checkEnabled ? "false" : "true"}
														/>
														<FormSubmitButton
															label={checkEnabled ? "Check off" : "Check on"}
															pendingLabel="..."
															size="xs"
															variant="ghost"
															className="h-6 px-2"
															disabled={isProtected}
														/>
													</form>
													<form action={setContainerUpdatePolicyAction}>
														<input type="hidden" name="environmentId" value={environmentId} />
														<input type="hidden" name="containerName" value={containerName} />
														<input type="hidden" name="mode" value="update" />
														<input
															type="hidden"
															name="enabled"
															value={updateEnabled ? "false" : "true"}
														/>
														<FormSubmitButton
															label={updateEnabled ? "Auto off" : "Auto on"}
															pendingLabel="..."
															size="xs"
															variant="ghost"
															className="h-6 px-2"
															disabled={isProtected}
														/>
													</form>
												</div>
												<div className="flex items-center gap-1">
													{checkFailed ? (
														<PopoverCard
															trigger={
																<Badge variant="danger" className="text-[10px]">
																	Check failed
																</Badge>
															}
														>
															<div className="space-y-2 text-[11px]">
																<p className="font-medium text-danger">Update check failed</p>
																<p className="text-muted">
																	{updateState?.lastError ||
																		"Unable to inspect latest image state."}
																</p>
															</div>
														</PopoverCard>
													) : updateAvailable ? (
														<Badge variant="warning" className="text-[10px]">
															Patch/minor available
														</Badge>
													) : majorUpdateAvailable ? (
														<PopoverCard
															trigger={
																<Badge variant="warning" className="text-[10px]">
																	Major available
																</Badge>
															}
														>
															<div className="space-y-2 text-[11px]">
																<p className="font-medium text-warning">
																	Major upgrade available
																</p>
																<p className="text-muted">
																	Current:{" "}
																	<span className="font-mono text-foreground">
																		{container.Image || "unknown"}
																	</span>
																</p>
																<p className="text-muted">
																	Target:{" "}
																	<span className="font-mono text-foreground">
																		{majorTargetImageRef || "latest"}
																	</span>{" "}
																	({majorTargetTag})
																</p>
															</div>
														</PopoverCard>
													) : (
														<Badge variant="default" className="text-[10px]">
															Up to date
														</Badge>
													)}
												</div>
											</div>
										</DataTableCell>
									) : null}

									{/* ACTIONS */}
									{isVisible("actions") ? (
										<DataTableCell>
											<div className="flex items-center justify-end gap-0.5">
												<form action={checkContainerUpdatesAction}>
													<input type="hidden" name="containerId" value={container.ID} />
													<input type="hidden" name="environmentId" value={environmentId} />
													<FormSubmitButton
														label=""
														pendingLabel=""
														disabled={isProtected}
														variant="ghost"
														size="xs"
														title="Check updates"
														className="h-7 w-7 p-0"
													>
														<RefreshCw className="h-3.5 w-3.5" />
													</FormSubmitButton>
												</form>
												<form action={applyContainerUpdatesAction}>
													<input type="hidden" name="containerId" value={container.ID} />
													<input type="hidden" name="environmentId" value={environmentId} />
													<input type="hidden" name="updateOnlyRunning" value="true" />
													<FormSubmitButton
														label=""
														pendingLabel=""
														disabled={isProtected || !updateAvailable}
														variant="ghost"
														size="xs"
														title="Queue update"
														className="h-7 w-7 p-0"
													>
														<ArrowUpCircle className="h-3.5 w-3.5" />
													</FormSubmitButton>
												</form>
												{isRunning ? (
													<>
														<form action={controlContainerAction}>
															<input
																type="hidden"
																name="containerId"
																value={container.ID}
															/>
															<input type="hidden" name="action" value="stop" />
															<input
																type="hidden"
																name="environmentId"
																value={environmentId}
															/>
															<FormSubmitButton
																label=""
																pendingLabel=""
																disabled={isProtected}
																variant="ghost"
																size="xs"
																title="Stop"
																className="h-7 w-7 p-0"
															>
																<Square className="h-3.5 w-3.5" />
															</FormSubmitButton>
														</form>
														<form action={controlContainerAction}>
															<input
																type="hidden"
																name="containerId"
																value={container.ID}
															/>
															<input type="hidden" name="action" value="restart" />
															<input
																type="hidden"
																name="environmentId"
																value={environmentId}
															/>
															<FormSubmitButton
																label=""
																pendingLabel=""
																disabled={isProtected}
																variant="ghost"
																size="xs"
																title="Restart"
																className="h-7 w-7 p-0"
															>
																<RefreshCw className="h-3.5 w-3.5" />
															</FormSubmitButton>
														</form>
													</>
												) : (
													<>
														<form action={controlContainerAction}>
															<input
																type="hidden"
																name="containerId"
																value={container.ID}
															/>
															<input type="hidden" name="action" value="start" />
															<input
																type="hidden"
																name="environmentId"
																value={environmentId}
															/>
															<FormSubmitButton
																label=""
																pendingLabel=""
																disabled={isProtected}
																variant="ghost"
																size="xs"
																title="Start"
																className="h-7 w-7 p-0"
															>
																<Play className="h-3.5 w-3.5" />
															</FormSubmitButton>
														</form>
														<DestructiveActionModal
															action={controlContainerAction}
															title={`Remove container ${container.Names}`}
															description="This permanently removes the container."
															triggerLabel=""
															confirmLabel="Remove"
															pendingLabel="Removing..."
															triggerVariant="ghost"
															triggerSize="xs"
															disabled={isProtected}
															hiddenFields={{
																containerId: container.ID,
																action: "remove",
																environmentId,
															}}
															triggerClassName="h-7 w-7 p-0 text-muted hover:text-danger"
															triggerIcon={<Trash2 className="h-3.5 w-3.5" />}
															options={[
																{
																	name: "removeVolumes",
																	label: "Remove anonymous volumes",
																	description:
																		"Data in attached anonymous volumes will be lost.",
																},
															]}
														/>
													</>
												)}
												<LinkButton
													href={`/dashboard/shell?target=container&containerId=${container.ID}&environment=${environmentId}`}
													variant="ghost"
													size="icon-xs"
													title="Shell"
												>
													<SquareTerminal className="h-3.5 w-3.5" />
												</LinkButton>
												<LinkButton
													href={`/dashboard/logs?mode=single&container=${container.ID}&environment=${environmentId}`}
													variant="ghost"
													size="icon-xs"
													title="Logs"
												>
													<LogsIcon className="h-3.5 w-3.5" />
												</LinkButton>
												<LinkButton
													href={`/dashboard/containers/${container.ID}?environment=${environmentId}`}
													variant="ghost"
													size="icon-xs"
													title="Details"
												>
													<ExternalLink className="h-3.5 w-3.5" />
												</LinkButton>
											</div>
										</DataTableCell>
									) : null}
								</DataTableRow>
							);
						})
					) : (
						<DataTableEmpty colSpan={visibleCount}>
							No containers matched the current filters.
						</DataTableEmpty>
					)}
				</DataTableBody>
			</DataTable>

			{logDockOpen && watchStackId ? (
				<div className="fixed inset-y-4 right-4 z-40 w-[min(44rem,92vw)] max-w-xl rounded-xl border border-default/12 bg-surface/95 shadow-[var(--shadow-lg)] backdrop-blur-sm">
					<div className="flex items-center justify-between border-b border-default/10 px-4 py-3">
						<div className="min-w-0">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted/75">
								Live Deploy Console
							</p>
							<p className="truncate text-sm font-medium">Queued stack: {watchStackId}</p>
						</div>
						<div className="flex items-center gap-1.5">
							<LinkButton
								href={`/dashboard/stacks?environment=${environmentId}&watchStackId=${watchStackId}`}
								variant="ghost"
								size="icon-xs"
								title="Open stacks workspace"
							>
								<TerminalSquare className="h-3.5 w-3.5" />
							</LinkButton>
							<button
								type="button"
								onClick={() => {
									setLogDockOpen(false);
									setWatchStackId("");
								}}
								className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
								aria-label="Close deploy console"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
					<div className="p-3">
						<LiveStackFeed stackId={watchStackId} height="min(72vh, 760px)" />
					</div>
				</div>
			) : null}
		</>
	);
}
