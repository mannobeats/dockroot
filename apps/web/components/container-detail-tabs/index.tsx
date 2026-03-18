"use client";

import { useMemo, useState } from "react";
import { ContainerFileBrowser } from "@/components/container-file-browser";
import { ContainerMetricsPanel } from "@/components/container-metrics-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { ConfigTab } from "./config-tab";
import { CONTAINER_DETAIL_TABS } from "./constants";
import { LogsTab } from "./logs-tab";
import { NetworksTab } from "./networks-tab";
import { OverviewTab } from "./overview-tab";
import { StorageTab } from "./storage-tab";
import type { ContainerDetailTabsProps } from "./types";
import { parsePercent, safeContainerDetailTab, summarizeLogs } from "./utils";

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
	managerUrl,
	canOpenRuntimeTopology,
	browser,
	targetPath,
	initialTab,
}: ContainerDetailTabsProps) {
	const editorHeight = "min(60vh, 640px)";
	const [activeTab, setActiveTab] = useState(safeContainerDetailTab(initialTab));

	const runtimeStats = (details?.stats || {}) as Record<string, string>;
	const memoryPercent = parsePercent(runtimeStats.MemPerc);
	const cpuPercent = parsePercent(runtimeStats.CPUPerc);
	const recentLogs = summarizeLogs(String(details?.logs || "No logs available."));
	const sortedEnv = useMemo(() => [...envVars].sort((a, b) => a.localeCompare(b)), [envVars]);

	return (
		<div>
			<TabsList>
				{CONTAINER_DETAIL_TABS.map((tab) => (
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
					<OverviewTab
						inspect={inspect}
						details={details}
						runtimeStats={runtimeStats}
						cpuPercent={cpuPercent}
						memoryPercent={memoryPercent}
						publishedPortSummary={publishedPortSummary}
						managerUrl={managerUrl}
						recentLogs={recentLogs}
						containerId={containerId}
						environmentId={environmentId}
					/>
				) : null}

				{activeTab === "metrics" ? (
					metrics ? (
						<ContainerMetricsPanel metrics={metrics} />
					) : (
						<EmptyState
							title="Metrics unavailable"
							description="Metrics are only available for local Docker environments with telemetry enabled."
						/>
					)
				) : null}

				{activeTab === "logs" ? (
					<LogsTab
						containerId={containerId}
						environmentId={environmentId}
						logs={String(details?.logs || "No logs available.")}
					/>
				) : null}

				{activeTab === "config" ? (
					<ConfigTab sortedEnv={sortedEnv} labels={labels} editorHeight={editorHeight} />
				) : null}

				{activeTab === "networks" ? (
					<NetworksTab
						networkEntries={networkEntries}
						canOpenRuntimeTopology={canOpenRuntimeTopology}
						environmentId={environmentId}
					/>
				) : null}

				{activeTab === "storage" ? <StorageTab mounts={mounts} /> : null}

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
