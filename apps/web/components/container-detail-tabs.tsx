"use client";

import Link from "next/link";
import { useState } from "react";
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

type Tab = "overview" | "metrics" | "logs" | "config" | "networks" | "files";
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
	mounts: Array<{ Source?: string; Destination?: string; Type?: string }>;
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
	const [activeTab, setActiveTab] = useState<Tab>((initialTab as Tab) || "overview");

	const tabs: { id: Tab; label: string }[] = [
		{ id: "overview", label: "Overview" },
		{ id: "metrics", label: "Metrics" },
		{ id: "logs", label: "Logs" },
		{ id: "config", label: "Configuration" },
		{ id: "networks", label: "Networks" },
		{ id: "files", label: "Files" },
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
				{activeTab === "overview" && (
					<div className="space-y-4">
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<MetricCard
								label="Image"
								value={String((inspect.Config as Record<string, unknown>)?.Image || "—")}
								className="h-full"
								valueClassName="break-all text-sm"
							/>
							<MetricCard
								label="Started at"
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
									details
										? `${(details as Record<string, Record<string, string>>).stats?.MemUsage || "—"} · ${(details as Record<string, Record<string, string>>).stats?.CPUPerc || "—"}`
										: "—"
								}
								className="h-full"
								valueClassName="text-sm"
							/>
						</div>
						<Panel padding="sm">
							<p className="text-xs text-muted">Published ports</p>
							<div className="mt-3">
								<RuntimePortLinks ports={publishedPortSummary} />
							</div>
						</Panel>
						{/* Quick logs preview */}
						<Panel padding="sm">
							<div className="flex items-center justify-between">
								<p className="text-sm font-semibold">Recent logs</p>
								<LinkButton
									href="#"
									variant="ghost"
									size="sm"
									onClick={() => setActiveTab("logs")}
								>
									View all →
								</LinkButton>
							</div>
							<LogBlock className="mt-3 max-h-[260px] p-4">
								{String((details as Record<string, unknown>)?.logs || "No logs available.")}
							</LogBlock>
						</Panel>
					</div>
				)}

				{activeTab === "metrics" && (
					<div>
						{metrics ? (
							<ContainerMetricsPanel metrics={metrics} />
						) : (
							<EmptyState title="Metrics unavailable" description="Metrics are only available for local Docker environments with Prometheus configured." />
						)}
					</div>
				)}

				{activeTab === "logs" && (
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
						<LogBlock className="mt-3 max-h-[600px] p-4">
							{String((details as Record<string, unknown>)?.logs || "No logs available.")}
						</LogBlock>
					</Panel>
				)}

				{activeTab === "config" && (
					<div className="grid gap-4 xl:grid-cols-2">
						<Panel className="overflow-hidden">
							<PanelHeader>
								<PanelTitle>Environment variables</PanelTitle>
							</PanelHeader>
							<CodeEditor value={envVars.join("\n")} language="env" readOnly minHeight="420px" />
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
							/>
						</Panel>
					</div>
				)}

				{activeTab === "networks" && (
					<div className="space-y-4">
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
													<DataTableCell className="text-xs text-muted">{network.Gateway || "—"}</DataTableCell>
												</DataTableRow>
											))
										) : (
											<DataTableEmpty colSpan={3}>No network attachments.</DataTableEmpty>
										)}
								</DataTableBody>
							</DataTable>
						</Panel>

						{/* Mounts / Storage */}
						<Panel padding="sm">
							<p className="text-sm font-semibold">Mounts</p>
							<div className="mt-3 space-y-2 text-sm text-muted">
								{mounts.length ? (
									mounts.map((mount) => (
										<div
											key={`${mount.Source}-${mount.Destination}`}
											className="rounded-lg bg-foreground/[0.03] px-3 py-2"
										>
											<p className="font-medium text-foreground">{mount.Destination}</p>
											<p className="mt-0.5 text-xs">
												{mount.Source || mount.Type || "Docker managed"}
											</p>
										</div>
									))
								) : (
									<p>No mounts configured.</p>
								)}
							</div>
						</Panel>
					</div>
				)}

				{activeTab === "files" && (
					<ContainerFileBrowser
						containerId={containerId}
						path={targetPath}
						environmentId={environmentId}
						browser={browser}
					/>
				)}
			</TabsPanel>
		</div>
	);
}
