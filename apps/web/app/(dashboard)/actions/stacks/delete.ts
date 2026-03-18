"use server";

import { redirect } from "next/navigation";
import {
	getRequiredControllableStack,
	recordAuditEvent,
} from "@/app/(dashboard)/actions/stacks/shared";
import {
	getValue,
	requireDestructiveConfirmation,
} from "@/app/(dashboard)/actions/utils/form-data";
import { requireUserSession } from "@/lib/authorization";
import { deleteStack } from "@/lib/platform";

export async function deleteStackAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const { userId } = await requireUserSession();
	const stackId = getValue(formData, "stackId");

	if (!stackId) {
		throw new Error("Stack is required");
	}

	const stack = await getRequiredControllableStack(
		stackId,
		userId,
		"Dockroot platform stacks are locked and cannot be deleted from the UI.",
	);

	await deleteStack({
		stackId,
		userId,
	});
	await recordAuditEvent({
		environmentId: stack.environment?.id,
		userId,
		actionType: "stack.delete",
		status: "success",
		details: { stackName: stack.name, stackId },
	});

	redirect(
		`/dashboard/stacks${stack.environment?.id ? `?environment=${encodeURIComponent(stack.environment.id)}` : ""}`,
	);
}
