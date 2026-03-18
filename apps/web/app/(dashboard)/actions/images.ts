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
	listContainersForEnvironment,
	pruneImagesForEnvironment,
	pullImageForEnvironment,
	removeImageForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { listContainers } from "@/lib/platform/docker";
import { isProtectedManagerImage } from "@/lib/runtime-protection";

function getContainerDisplayName(container: Record<string, string>) {
	return container.Names || container.Name || container.ID?.slice(0, 12) || "container";
}

function listContainersUsingImage(containers: Record<string, string>[], imageRef: string) {
	return containers
		.filter((container) => (container.Image || "").trim() === imageRef)
		.map(getContainerDisplayName);
}

export async function pullImageAction(formData: FormData) {
	const auth = await requirePrivilegedSession();
	const imageRef = getValue(formData, "imageRef");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!imageRef) {
		throw new Error("Image reference is required");
	}

	await pullImageForEnvironment(auth.userId, imageRef, environmentId);
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "image.pull",
		details: { imageRef },
	});
	revalidatePath("/dashboard/images");
}

export async function removeImageAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const imageRef = getValue(formData, "imageRef");
	const environmentId = getValue(formData, "environmentId") || undefined;

	if (!imageRef) {
		throw new Error("Image reference is required");
	}

	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const containers =
		environment.kind === "local"
			? await listContainers()
			: (await listContainersForEnvironment(auth.userId, environment.id)).containers;

	if (environment.kind === "local" && isProtectedManagerImage(imageRef, containers)) {
		throw new Error("Dockroot protected images cannot be deleted from the runtime dashboard.");
	}
	const inUseBy = listContainersUsingImage(containers, imageRef);
	if (inUseBy.length) {
		throw new Error(
			`Cannot delete image ${imageRef}: it is in use by ${inUseBy.length} container(s): ${inUseBy.slice(0, 3).join(", ")}${inUseBy.length > 3 ? ", ..." : ""}.`,
		);
	}

	try {
		await removeImageForEnvironment(auth.userId, imageRef, environmentId);
		const { recordAuditEvent } = await import("@/lib/platform");
		await recordAuditEvent({
			environmentId,
			userId: auth.userId,
			actionType: "image.remove",
			details: { imageRef },
		});
	} catch (error) {
		throw normalizeInUseDeleteError("image", imageRef, error);
	}
	revalidatePath("/dashboard/images");
}

export async function bulkRemoveImagesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const imageRefs = getValues(formData, "imageRefs");
	const environmentId = getValue(formData, "environmentId") || undefined;
	if (!imageRefs.length) {
		throw new Error("At least one image is required.");
	}

	const environment = await resolveRuntimeEnvironment(auth.userId, environmentId);
	const containers =
		environment.kind === "local"
			? await listContainers()
			: (await listContainersForEnvironment(auth.userId, environment.id)).containers;
	const inUseErrors: string[] = [];
	for (const imageRef of Array.from(new Set(imageRefs))) {
		if (environment.kind === "local" && isProtectedManagerImage(imageRef, containers)) {
			continue;
		}
		const inUseBy = listContainersUsingImage(containers, imageRef);
		if (inUseBy.length) {
			inUseErrors.push(
				`${imageRef} (used by ${inUseBy.slice(0, 2).join(", ")}${inUseBy.length > 2 ? ", ..." : ""})`,
			);
			continue;
		}
		try {
			await removeImageForEnvironment(auth.userId, imageRef, environmentId);
		} catch (error) {
			throw normalizeInUseDeleteError("image", imageRef, error);
		}
	}
	if (inUseErrors.length) {
		throw new Error(
			`Some images cannot be deleted because they are in use: ${inUseErrors.slice(0, 5).join("; ")}${inUseErrors.length > 5 ? "; ..." : ""}.`,
		);
	}
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "image.remove.bulk",
		details: { imageRefs: Array.from(new Set(imageRefs)) },
	});
	revalidatePath("/dashboard/images");
}

export async function pruneImagesAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const auth = await requirePrivilegedSession();
	const mode = getValue(formData, "mode");
	const environmentId = getValue(formData, "environmentId") || undefined;
	await pruneImagesForEnvironment(auth.userId, environmentId, { all: mode === "all" });
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId: auth.userId,
		actionType: "image.prune",
		details: { mode: mode || "dangling" },
	});
	revalidatePath("/dashboard/images");
}
