"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { ContainerFileBrowser } from "@/components/container-file-browser";
import { ContainerMetricsPanel } from "@/components/container-metrics-panel";
import { RuntimePortLinks } from "@/components/runtime-port-links";
import {
	DataTable,
	DataTableBody,
	DataTableCell,
	DataTableEmpty,
	DataTableHead,
	DataTableHeader,
	DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { LogBlock } from "@/components/ui/log-block";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { UtilizationBar } from "@/components/ui/utilization-bar";

type Tab = "overview" | "metrics" | "logs" | "config" | "networks" | "storage" | "files";

type ContainerMetrics = {
	available: boolean;
	cpuPercent: number | null;
	memoryBytes: number | null;
	rxBytes: number | null;
	txBytes: number | null;
	cpuSeries: Array<{ time: string; value: number }>;
	memorySeries: Array<{ time: string; value: number }>;
	rxSeries: Array<{ time: string; value: number }>;
	txSeries: Array<{ time: string; value: number }>;
};

const tabs: { id: Tab; label: string }[] = [
	{ id: "overview", label: "Overview" },
	{ id: "metrics", label: "Metrics" },
	{ id: "logs", label: "Logs" },
	{ id: "config", label: "Configuration" },
	{ id: "networks", label: "Networks" },
	{ id: "storage", label: "Storage" },
	{ id: "files", label: "Files" },
];

function safeTab(value: string | undefined): Tab {
	return tabs.find((tab) => tab.id === value)?.id || "overview";
}

function parsePercent(value: string | undefined) {
	return Number.parseFloat((value || "0").replace("%", "")) || 0;
}

function summarizeLogs(input: string) {
	const lines = input.split("\n").filter(Boolean);
	return lines.slice(Math.max(0, lines.length - 120)).join("\n");
}

export function ContainerDetailTabs({
	containerId,
	environmentId,
	inspect,
	details,
	metrics,
	mounts,
	envVars,
	labels,
	networkEntries,
	publishedPortSummary,
	canOpenRuntimeTopology,
	browser,
	targetPath,
	initialTab,
}: {
	containerId: string;
	environmentId: string;
	inspect: Record<string, unknown>;
	details: Record<string, unknown> | null;
	metrics: ContainerMetrics | null;
	mounts: Array<{ Source?: string; Destination?: string; Type?: string; RW?: boolean }>;
	envVars: string[];
	labels: Record<string, string>;
	networkEntries: Array<[string, { IPAddress?: string; Gateway?: string }]>;
	publishedPortSummary: string;
	canOpenRuntimeTopology: boolean;
	browser:
		| {
				kind: "directory";
				path: string;
				entries: Array<{ name: string; kind: "dir" | "file" | "other" }>;
		  }
		| { kind: "file"; path: string; content: string }
		| { kind: "missing"; path: string };
	targetPath: string;
	initialTab?: string;
}) {
	const editorHeight = "min(60vh, 640px)";
	const [activeTab, setActiveTab] = useState<Tab>(safeTab(initialTab));

	const runtimeStats = (details?.stats || {}) as Record<string, string>;
	const memoryPercent = parsePercent(runtimeStats.MemPerc);
	const cpuPercent = parsePercent(runtimeStats.CPUPerc);
	const recentLogs = summarizeLogs(String(details?.logs || "No logs available."));
	const sortedEnv = useMemo(() => [...envVars].sort((a, b) => a.localeCompare(b)), [envVars]);

	return (
		<div>
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

			<TabsPanel>
				{activeTab === "overview" ? (
					<div className="space-y-4">
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<MetricCard
								label="Image"
								value={String((inspect.Config as Record<string, unknown>)?.Image || "—")}
								className="h-full"
								valueClassName="break-all text-sm"
							/>
							<MetricCard
								label="Started"
								value={String((inspect.State as Record<string, unknown>)?.StartedAt || "—")}
								className="h-full"
								valueClassName="text-sm"
							/>
							<MetricCard
								label="Restart count"
								value={String((inspect as Record<string, unknown>).RestartCount || 0)}
								className="h-full"
								valueClassName="text-sm"
							/>
							<MetricCard
								label="Memory / CPU"
								value={
									details ? `${runtimeStats.MemUsage || "—"} · ${runtimeStats.CPUPerc || "—"}` : "—"
								}
								className="h-full"
								valueClassName="text-sm"
							/>
						</div>

						<Panel padding="md" className="space-y-4">
							<p className="text-sm font-semibold">Current resource utilization</p>
							<UtilizationBar
								label="CPU"
								valueLabel={`${cpuPercent.toFixed(1)}%`}
								percent={cpuPercent}
								helper="Live container CPU usage"
							/>
							<UtilizationBar
								label="Memory"
								valueLabel={runtimeStats.MemUsage || "—"}
								percent={memoryPercent}
								helper={`Usage against limit (${runtimeStats.MemLimit || "—"})`}
							/>
						</Panel>

						<Panel padding="sm">
							<p className="text-xs text-muted">Published ports</p>
							<div className="mt-3">
								<RuntimePortLinks ports={publishedPortSummary} />
							</div>
						</Panel>

						<Panel padding="sm">
							<div className="flex items-center justify-between">
								<p className="text-sm font-semibold">Recent logs</p>
								<LinkButton
									href={`/dashboard/logs?mode=single&container=${containerId}&environment=${environmentId}`}
									variant="ghost"
									size="sm"
								>
									Open live logs →
								</LinkButton>
							</div>
							<LogBlock className="mt-3 max-h-[320px] p-4">{recentLogs}</LogBlock>
						</Panel>
					</div>
				) : null}

				{activeTab === "metrics" ? (
					metrics ? (
						<ContainerMetricsPanel metrics={metrics} />
					) : (
						<EmptyState
							title="Metrics unavailable"
							description="Metrics are only available for local Docker environments with Prometheus configured."
						/>
					)
				) : null}

				{activeTab === "logs" ? (
					<Panel padding="sm">
						<div className="flex items-center justify-between">
							<p className="text-sm font-semibold">Container logs</p>
							<LinkButton
								href={`/dashboard/logs?mode=single&container=${containerId}&environment=${environmentId}`}
								variant="ghost"
								size="sm"
							>
								Open live workspace →
							</LinkButton>
						</div>
						<LogBlock className="mt-3 max-h-[680px] p-4">
							{String(details?.logs || "No logs available.")}
						</LogBlock>
					</Panel>
				) : null}

				{activeTab === "config" ? (
					<div className="grid gap-4 xl:grid-cols-2">
						<Panel className="overflow-hidden">
							<PanelHeader>
								<PanelTitle>Environment variables</PanelTitle>
							</PanelHeader>
							<CodeEditor
								value={sortedEnv.join("\n")}
								language="env"
								readOnly
								minHeight="420px"
								maxHeight={editorHeight}
								height={editorHeight}
							/>
						</Panel>
						<Panel className="overflow-hidden">
							<PanelHeader>
								<PanelTitle>Labels</PanelTitle>
							</PanelHeader>
							<CodeEditor
								value={JSON.stringify(labels, null, 2)}
								language="env"
								readOnly
								minHeight="420px"
								maxHeight={editorHeight}
								height={editorHeight}
							/>
						</Panel>
					</div>
				) : null}

				{activeTab === "networks" ? (
					<Panel>
						<DataTable>
							<DataTableHeader>
								<tr>
									<DataTableHead>Network</DataTableHead>
									<DataTableHead>IP Address</DataTableHead>
									<DataTableHead>Gateway</DataTableHead>
								</tr>
							</DataTableHeader>
							<DataTableBody>
								{networkEntries.length ? (
									networkEntries.map(([name, network]) => (
										<DataTableRow key={name}>
											<DataTableCell className="font-medium">
												{canOpenRuntimeTopology ? (
													<Link
														href={`/dashboard/networks/${encodeURIComponent(name)}?environment=${environmentId}`}
														className="transition-colors hover:text-foreground/80"
													>
														{name}
													</Link>
												) : (
													name
												)}
											</DataTableCell>
											<DataTableCell className="text-xs text-muted">
												{network.IPAddress || "—"}
											</DataTableCell>
											<DataTableCell className="text-xs text-muted">
												{network.Gateway || "—"}
											</DataTableCell>
										</DataTableRow>
									))
								) : (
									<DataTableEmpty colSpan={3}>No network attachments.</DataTableEmpty>
								)}
							</DataTableBody>
						</DataTable>
					</Panel>
				) : null}

				{activeTab === "storage" ? (
					<Panel padding="sm">
						<p className="text-sm font-semibold">Mounts</p>
						<div className="mt-3 space-y-2 text-sm text-muted">
							{mounts.length ? (
								mounts.map((mount) => (
									<div
										key={`${mount.Source}-${mount.Destination}`}
										className="rounded-lg bg-foreground/[0.03] px-3 py-2"
									>
										<p className="font-medium text-foreground">{mount.Destination || "Unknown"}</p>
										<p className="mt-0.5 text-xs">
											{mount.Source || mount.Type || "Docker managed"}
										</p>
										<p className="mt-1 text-[11px] text-muted">
											{mount.RW === false ? "Read-only" : "Read-write"}
										</p>
									</div>
								))
							) : (
								<p>No mounts configured.</p>
							)}
						</div>
					</Panel>
				) : null}

				{activeTab === "files" ? (
					<ContainerFileBrowser
						containerId={containerId}
						path={targetPath}
						environmentId={environmentId}
						browser={browser}
					/>
				) : null}
			</TabsPanel>
		</div>
	);
}
