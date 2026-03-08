"use client";

import Link from "next/link";
import { useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { ContainerFileBrowser } from "@/components/container-file-browser";
import { ContainerMetricsPanel } from "@/components/container-metrics-panel";
import { RuntimePortLinks } from "@/components/runtime-port-links";

type Tab = "overview" | "metrics" | "logs" | "config" | "networks" | "files";

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	metrics: any;
	mounts: Array<{ Source?: string; Destination?: string; Type?: string }>;
	envVars: string[];
	labels: Record<string, string>;
	networkEntries: Array<[string, { IPAddress?: string; Gateway?: string }]>;
	publishedPortSummary: string;
	canOpenRuntimeTopology: boolean;
	browser:
		| { kind: "directory"; path: string; entries: Array<{ name: string; kind: "dir" | "file" | "other" }> }
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
				{activeTab === "overview" && (
					<div className="space-y-4">
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<div className="rounded-xl border border-default/10 bg-surface p-4">
								<p className="text-xs text-muted">Image</p>
								<p className="mt-2 break-all text-sm font-medium">{String((inspect.Config as Record<string, unknown>)?.Image || "—")}</p>
							</div>
							<div className="rounded-xl border border-default/10 bg-surface p-4">
								<p className="text-xs text-muted">Started at</p>
								<p className="mt-2 text-sm font-medium">{String((inspect.State as Record<string, unknown>)?.StartedAt || "—")}</p>
							</div>
							<div className="rounded-xl border border-default/10 bg-surface p-4">
								<p className="text-xs text-muted">Restart count</p>
								<p className="mt-2 text-sm font-medium">{String((inspect as Record<string, unknown>).RestartCount || 0)}</p>
							</div>
							<div className="rounded-xl border border-default/10 bg-surface p-4">
								<p className="text-xs text-muted">Memory / CPU</p>
								<p className="mt-2 text-sm font-medium">
									{details
										? `${(details as Record<string, Record<string, string>>).stats?.MemUsage || "—"} · ${(details as Record<string, Record<string, string>>).stats?.CPUPerc || "—"}`
										: "—"}
								</p>
							</div>
						</div>
						<div className="rounded-xl border border-default/10 bg-surface p-4">
							<p className="text-xs text-muted">Published ports</p>
							<div className="mt-3">
								<RuntimePortLinks ports={publishedPortSummary} />
							</div>
						</div>
						{/* Quick logs preview */}
						<div className="rounded-xl border border-default/10 bg-surface p-4">
							<div className="flex items-center justify-between">
								<p className="text-sm font-semibold">Recent logs</p>
								<button
									type="button"
									onClick={() => setActiveTab("logs")}
									className="text-xs font-medium text-muted transition-colors hover:text-foreground"
								>
									View all →
								</button>
							</div>
							<pre className="log-viewport mt-3 max-h-[260px] rounded-lg bg-[#0a0a0a] p-4 text-xs leading-5 text-white/85">
								{String((details as Record<string, unknown>)?.logs || "No logs available.")}
							</pre>
						</div>
					</div>
				)}

				{activeTab === "metrics" && (
					<div>
						{metrics ? (
							<ContainerMetricsPanel metrics={metrics} />
						) : (
							<div className="rounded-xl border border-dashed border-default/10 p-12 text-center text-sm text-muted">
								Metrics are only available for local Docker environments with Prometheus configured.
							</div>
						)}
					</div>
				)}

				{activeTab === "logs" && (
					<div className="rounded-xl border border-default/10 bg-surface p-4">
						<div className="flex items-center justify-between">
							<p className="text-sm font-semibold">Container logs</p>
							<Link
								href={`/dashboard/logs?mode=single&container=${containerId}&environment=${environmentId}`}
								className="text-xs font-medium text-muted transition-colors hover:text-foreground"
							>
								Open live workspace →
							</Link>
						</div>
						<pre className="log-viewport mt-3 max-h-[600px] rounded-lg bg-[#0a0a0a] p-4 text-xs leading-5 text-white/85">
							{String((details as Record<string, unknown>)?.logs || "No logs available.")}
						</pre>
					</div>
				)}

				{activeTab === "config" && (
					<div className="grid gap-4 xl:grid-cols-2">
						<div className="overflow-hidden rounded-xl border border-default/10">
							<div className="border-b border-default/10 px-4 py-3">
								<p className="text-sm font-semibold">Environment variables</p>
							</div>
							<CodeEditor value={envVars.join("\n")} language="env" readOnly minHeight="420px" />
						</div>
						<div className="overflow-hidden rounded-xl border border-default/10">
							<div className="border-b border-default/10 px-4 py-3">
								<p className="text-sm font-semibold">Labels</p>
							</div>
							<CodeEditor
								value={JSON.stringify(labels, null, 2)}
								language="env"
								readOnly
								minHeight="420px"
							/>
						</div>
					</div>
				)}

				{activeTab === "networks" && (
					<div className="space-y-4">
						<div className="rounded-xl border border-default/10 bg-surface">
							<div className="table-scroll">
								<table className="min-w-full text-left text-sm">
									<thead>
										<tr className="border-b border-default/10 text-xs text-muted">
											<th className="px-4 py-3 font-medium">Network</th>
											<th className="px-4 py-3 font-medium">IP Address</th>
											<th className="px-4 py-3 font-medium">Gateway</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-default/5">
										{networkEntries.length ? (
											networkEntries.map(([name, network]) => (
												<tr key={name} className="transition-colors hover:bg-foreground/[0.02]">
													<td className="px-4 py-3 font-medium">
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
													</td>
													<td className="px-4 py-3 text-xs text-muted">{network.IPAddress || "—"}</td>
													<td className="px-4 py-3 text-xs text-muted">{network.Gateway || "—"}</td>
												</tr>
											))
										) : (
											<tr>
												<td colSpan={3} className="px-4 py-12 text-center text-sm text-muted">
													No network attachments.
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>

						{/* Mounts / Storage */}
						<div className="rounded-xl border border-default/10 bg-surface p-4">
							<p className="text-sm font-semibold">Mounts</p>
							<div className="mt-3 space-y-2 text-sm text-muted">
								{mounts.length ? (
									mounts.map((mount) => (
										<div key={`${mount.Source}-${mount.Destination}`} className="rounded-lg bg-foreground/[0.03] px-3 py-2">
											<p className="font-medium text-foreground">{mount.Destination}</p>
											<p className="mt-0.5 text-xs">{mount.Source || mount.Type || "Docker managed"}</p>
										</div>
									))
								) : (
									<p>No mounts configured.</p>
								)}
							</div>
						</div>
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
			</div>
		</div>
	);
}
