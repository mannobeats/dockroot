"use server";

import { revalidatePath } from "next/cache";
import { normalizeInUseDeleteError } from "@/app/(dashboard)/actions/utils/errors";
import {
	getValue,
	getValues,
	requireDestructiveConfirmation,
} from "@/app/(dashboard)/actions/utils/form-data";
import { requirePrivilegedSession } from "@/lib/authorization";
import {
	createNetworkForEnvironment,
	pruneNetworksForEnvironment,
	removeNetworkForEnvironment,
} from "@/lib/environment-runtime";

export async function createNetworkAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const driver = getValue(formData, "driver") || "bridge";
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!name) {
		throw new Error("Network name is required");
	}

	await createNetworkForEnvironment(auth.userId, name, driver, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "network.create",
		details: { networkName: name, driver },
	});
	revalidatePath("/dashboard/networks");
}

export async function removeNetworkAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const name = getValue(formData, "name");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!name) {
		throw new Error("Network name is required");
	}

	try {
		await removeNetworkForEnvironment(auth.userId, name, environmentId);
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			environmentId,
			userId: auth.userId,
			actionType: "network.remove",
			details: { networkName: name },
		});
	} catch (error) {
		throw normalizeInUseDeleteError("network", name, error);
	}
	revalidatePath("/dashboard/networks");
}

export async function bulkRemoveNetworksAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const names = getValues(formData, "names");
	const environmentId = getValue(formData, "environmentId") || undefined;
	if (!names.length) {
		throw new Error("At least one network is required.");
	}

	for (const name of Array.from(new Set(names))) {
		try {
			await removeNetworkForEnvironment(auth.userId, name, environmentId);
		} catch (error) {
			throw normalizeInUseDeleteError("network", name, error);
		}
	}
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "network.remove.bulk",
		details: { networkNames: Array.from(new Set(names)) },
	});
	revalidatePath("/dashboard/networks");
}

export async function pruneNetworksAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneNetworksForEnvironment(auth.userId, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "network.prune",
	});
	revalidatePath("/dashboard/networks");
}
