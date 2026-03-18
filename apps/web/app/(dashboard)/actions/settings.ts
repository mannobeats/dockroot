"use server";

import { getValue } from "@/app/(dashboard)/actions/utils/form-data";
import { requirePrivilegedSession } from "@/lib/authorization";
import { updateGlobalSettings } from "@/lib/platform";

export async function updateGlobalSettingsAction(formData: FormData) {
	const { userId } = await requirePrivilegedSession();
	const managerUrl = getValue(formData, "managerUrl");

	await updateGlobalSettings({
		userId,
		managerUrl,
	});
}
