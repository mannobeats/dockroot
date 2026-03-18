"use server";

import { revalidatePath } from "next/cache";
import { getValue } from "@/app/(dashboard)/actions/utils/form-data";
import { requireUserSession } from "@/lib/authorization";

export async function deleteActivityEventsAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const idsRaw = getValue(formData, "eventIds");
	if (!idsRaw) throw new Error("No events specified.");
	const eventIds = idsRaw
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	if (!eventIds.length) throw new Error("No events specified.");

	const { deleteActivityEvents } = await import("@/lib/platform");
	const result = await deleteActivityEvents(userId, eventIds);
	revalidatePath("/dashboard/activity");
	return result;
}

export async function clearAllActivityEventsAction() {
	const { userId } = await requireUserSession();
	const { clearAllActivityEvents } = await import("@/lib/platform");
	const result = await clearAllActivityEvents(userId);
	revalidatePath("/dashboard/activity");
	return result;
}
