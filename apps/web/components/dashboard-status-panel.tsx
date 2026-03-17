"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DonutStatusCard } from "@/components/infrastructure-charts";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DeploymentItem {
	id: string;
	status: string;
	version: string;
	createdAt: string;
	stack: { id: string; name: string };
	environment: { id: string; name: string };
}

interface CollectorItem {
	name: string;
	status: string;
	lastError: string;
}

export function DashboardStatusPanel({
	recentDeployments,
	deploymentStatus,
	environmentStatus,
	collectors,
	activityLink,
}: {
	recentDeployments: DeploymentItem[];
	deploymentStatus: Array<{ label: string; value: number }> | null;
	environmentStatus: Array<{ label: string; value: number }> | null;
	collectors: CollectorItem[] | null;
	activityLink: string;
}) {
	const [activeTab, setActiveTab] = useState<"activity" | "health">("activity");

	return (
		<Panel className="flex min-w-0 flex-col">
			<div className="px-4 pt-3">
				<TabsList>
					<TabsTrigger active={activeTab === "activity"} onClick={() => setActiveTab("activity")}>
						Activity
					</TabsTrigger>
					<TabsTrigger active={activeTab === "health"} onClick={() => setActiveTab("health")}>
						Health
					</TabsTrigger>
				</TabsList>
			</div>

			<div className="min-h-0 flex-1 p-4">
				{activeTab === "activity" ? (
					<ActivityTab deployments={recentDeployments} activityLink={activityLink} />
				) : (
					<HealthTab
						deploymentStatus={deploymentStatus}
						environmentStatus={environmentStatus}
						collectors={collectors}
					/>
				)}
			</div>
		</Panel>
	);
}

function ActivityTab({
	deployments,
	activityLink,
}: {
	deployments: DeploymentItem[];
	activityLink: string;
}) {
	if (!deployments.length) {
		return (
			<div className="flex flex-col items-center justify-center py-8 text-center">
				<p className="text-sm font-medium text-muted">No deployments yet</p>
				<p className="mt-1 text-[11px] text-muted/70">
					Tracked stack deployments will appear here.
				</p>
			</div>
		);
	}

	return (
		<div>
			<div className="divide-y divide-default/8">
				{deployments.slice(0, 6).map((deployment) => (
					<div key={deployment.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<p className="truncate text-sm font-medium">{deployment.stack.name}</p>
								<Badge className="shrink-0">{deployment.environment.name}</Badge>
							</div>
							<p className="mt-0.5 text-[11px] text-muted">
								<span className="font-mono">{deployment.version}</span>
								<span className="mx-1.5">·</span>
								{new Date(deployment.createdAt).toLocaleString()}
							</p>
						</div>
						<div className="shrink-0">
							<StatusBadge status={deployment.status} />
						</div>
					</div>
				))}
			</div>
			<div className="mt-3 border-t border-default/8 pt-3">
				<Link href={activityLink} className="text-xs font-medium text-accent hover:text-accent/80">
					View all deployments →
				</Link>
			</div>
		</div>
	);
}

function HealthTab({
	deploymentStatus,
	environmentStatus,
	collectors,
}: {
	deploymentStatus: Array<{ label: string; value: number }> | null;
	environmentStatus: Array<{ label: string; value: number }> | null;
	collectors: CollectorItem[] | null;
}) {
	const healthySummary = collectors
		? {
				healthy: collectors.filter((c) => c.status === "healthy").length,
				degraded: collectors.filter((c) => c.status !== "healthy").length,
			}
		: null;

	return (
		<div className="space-y-4">
			{deploymentStatus && environmentStatus ? (
				<div className="grid grid-cols-2 gap-3">
					<DonutStatusCard
						title="Deployments"
						items={deploymentStatus}
						emptyLabel="No deployment data yet."
					/>
					<DonutStatusCard
						title="Environments"
						items={environmentStatus}
						emptyLabel="No environment data yet."
					/>
				</div>
			) : (
				<div className="rounded-xl bg-foreground/[0.02] px-3 py-4 text-center">
					<p className="text-[11px] text-muted">Metrics unavailable for this environment.</p>
				</div>
			)}

			{collectors ? (
				<div>
					<p className="mb-2 text-[11px] font-medium text-muted">Monitoring Collectors</p>
					{healthySummary && healthySummary.degraded > 0 ? (
						<div className="space-y-2">
							{collectors.map((collector) => (
								<div
									key={collector.name}
									className="flex items-start justify-between gap-3 rounded-lg border border-default/10 bg-surface px-3 py-2.5"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<CheckCircle2
												className={`h-3 w-3 ${collector.status === "healthy" ? "text-success" : "text-warning"}`}
											/>
											<p className="text-xs font-medium">{collector.name}</p>
										</div>
										{collector.lastError ? (
											<p className="mt-1 text-[11px] text-warning">{collector.lastError}</p>
										) : null}
									</div>
									<StatusBadge status={collector.status} />
								</div>
							))}
						</div>
					) : (
						<div className="flex flex-wrap gap-1.5">
							{collectors.map((collector) => (
								<div
									key={collector.name}
									className="inline-flex items-center gap-1.5 rounded-full border border-default/10 bg-surface px-2.5 py-1"
								>
									<span className="h-1.5 w-1.5 rounded-full bg-success" />
									<span className="text-[11px] font-medium">{collector.name}</span>
								</div>
							))}
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
