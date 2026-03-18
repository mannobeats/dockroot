import "server-only";

import type { containerUpdateSchedules } from "@dockroot/db";

export type ContainerUpdateCheckSummary = {
	totalContainers: number;
	checkedContainers: number;
	availableContainers: number;
	skippedContainers: number;
	failedContainers: number;
};

export type ContainerUpdateApplySummary = {
	totalContainers: number;
	updatedContainers: number;
	queuedStacks: number;
	skippedContainers: number;
	failedContainers: number;
};

export type ContainerUpdatePolicyMap = Map<
	string,
	{
		id: string;
		checkEnabled: boolean;
		updateEnabled: boolean;
	}
>;

export type ContainerUpdateStateMap = Map<
	string,
	{
		id: string;
		updateAvailable: boolean;
		majorUpdateAvailable: boolean;
		majorTargetImageRef: string | null;
		majorTargetTag: string | null;
		lastResult: string | null;
		lastError: string | null;
		checkedAt: Date | null;
		updatedAt: Date | null;
	}
>;

export type ContainerUpdateCheckMode = (typeof containerUpdateSchedules.$inferInsert)["checkMode"];

export type ContainerUpdateRunMetrics = {
	totalContainers: number;
	checkedContainers: number;
	availableContainers: number;
	queuedStacks: number;
	updatedContainers: number;
	skippedContainers: number;
	failedContainers: number;
};
