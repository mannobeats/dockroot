"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { ContainerMetricsSummarySection } from "./summary-section";
import { ContainerMetricsTrendChartsSection } from "./trend-charts-section";
import type { ContainerMetrics } from "./types";

export function ContainerMetricsPanel({ metrics }: { metrics: ContainerMetrics }) {
	if (!metrics.available) {
		return (
			<EmptyState
				title="Metrics unavailable"
				description="Container metrics are not available yet for this container."
				className="p-6"
			/>
		);
	}

	return (
		<div className="space-y-5">
			<ContainerMetricsSummarySection metrics={metrics} />
			<ContainerMetricsTrendChartsSection metrics={metrics} />
		</div>
	);
}

export type { ContainerMetrics } from "./types";
