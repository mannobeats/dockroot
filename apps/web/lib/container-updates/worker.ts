import "server-only";

import { randomUUID } from "node:crypto";
import { containerUpdateSchedules, db } from "@dockroot/db";
import { eq } from "drizzle-orm";
import { runContainerUpdateApply } from "@/lib/container-updates/apply";
import { runContainerUpdateCheck } from "@/lib/container-updates/checks";
import { claimDueSchedules, releaseScheduleLease } from "@/lib/container-updates/schedule";
import { addMinutes, clampIntervalMinutes, now } from "@/lib/container-updates/shared";

export async function processDueContainerUpdateSchedules(input?: {
	workerId?: string;
	maxSchedules?: number;
}) {
	const workerId = input?.workerId?.trim() || `worker-${randomUUID().slice(0, 12)}`;
	const maxSchedules = Math.max(1, Math.min(10, input?.maxSchedules || 3));
	const claimed = await claimDueSchedules(workerId, maxSchedules);

	const summary = {
		workerId,
		claimed: claimed.length,
		processed: 0,
		checksRun: 0,
		updatesRun: 0,
		errors: 0,
	};

	for (const schedule of claimed) {
		const startedAt = now();
		try {
			const runCheck =
				schedule.autoCheckEnabled && (!schedule.nextCheckAt || schedule.nextCheckAt <= startedAt);
			const runUpdate =
				schedule.autoUpdateEnabled &&
				(!schedule.nextUpdateAt || schedule.nextUpdateAt <= startedAt);

			if (runCheck) {
				summary.checksRun += 1;
				await runContainerUpdateCheck({
					userId: schedule.createdByUserId,
					environmentId: schedule.environmentId,
					respectPolicies: true,
					pullBeforeCheck: schedule.pullBeforeCheck,
					includeMajorVersions: schedule.checkMode === "include_major",
					scheduleId: schedule.id,
				});
			}

			if (runUpdate) {
				summary.updatesRun += 1;
				if (!runCheck) {
					await runContainerUpdateCheck({
						userId: schedule.createdByUserId,
						environmentId: schedule.environmentId,
						respectPolicies: true,
						pullBeforeCheck: schedule.pullBeforeCheck,
						includeMajorVersions: schedule.checkMode === "include_major",
						scheduleId: schedule.id,
					});
				}
				await runContainerUpdateApply({
					userId: schedule.createdByUserId,
					environmentId: schedule.environmentId,
					respectPolicies: true,
					updateOnlyRunning: schedule.updateOnlyRunning,
					scheduleId: schedule.id,
				});
			}

			const finishedAt = now();
			await db
				.update(containerUpdateSchedules)
				.set({
					lastCheckAt: runCheck ? finishedAt : schedule.lastCheckAt,
					lastUpdateAt: runUpdate ? finishedAt : schedule.lastUpdateAt,
					nextCheckAt: runCheck
						? addMinutes(finishedAt, clampIntervalMinutes(schedule.checkIntervalMinutes, 60))
						: schedule.nextCheckAt,
					nextUpdateAt: runUpdate
						? addMinutes(finishedAt, clampIntervalMinutes(schedule.updateIntervalMinutes, 240))
						: schedule.nextUpdateAt,
					runningLeaseUntil: null,
					runningWorkerId: null,
					updatedAt: finishedAt,
				})
				.where(eq(containerUpdateSchedules.id, schedule.id));

			summary.processed += 1;
		} catch {
			summary.errors += 1;
			await releaseScheduleLease(schedule.id, now());
		}
	}

	return summary;
}
