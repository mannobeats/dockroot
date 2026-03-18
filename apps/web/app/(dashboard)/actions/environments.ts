"use server";

import { redirect } from "next/navigation";
import {
	getValue,
	requireDestructiveConfirmation,
} from "@/app/(dashboard)/actions/utils/form-data";
import { requireUserSession } from "@/lib/authorization";
import {
	createEnvironment,
	deleteEnvironment,
	rotateAgentRegistrationToken,
	updateEnvironment,
} from "@/lib/platform";

export async function createEnvironmentAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const name = getValue(formData, "name");
	const description = getValue(formData, "description");
	const agentUrl = getValue(formData, "agentUrl");

	if (!name) {
		throw new Error("Environment name is required");
	}

	const environmentId = await createEnvironment({
		userId,
		name,
		description,
		agentUrl,
	});
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		userId,
		actionType: "environment.create",
		details: {
			environmentName: name,
			description: description || null,
			agentUrl: agentUrl || null,
		},
	});

	redirect(`/dashboard/environments/${environmentId}`);
}

export async function rotateAgentRegistrationTokenAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");

	if (!environmentId) {
		throw new Error("Environment is required");
	}

	await rotateAgentRegistrationToken({
		environmentId,
		userId,
	});

	redirect(`/dashboard/environments/${environmentId}`);
}

export async function deleteEnvironmentAction(formData: FormData) {
	requireDestructiveConfirmation(formData);
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");

	if (!environmentId) {
		throw new Error("Environment is required");
	}

	await deleteEnvironment({
		environmentId,
		userId,
	});
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		userId,
		actionType: "environment.delete",
		details: { environmentId },
	});

	redirect("/dashboard/environments");
}

export async function updateEnvironmentAction(formData: FormData) {
	const { userId } = await requireUserSession();
	const environmentId = getValue(formData, "environmentId");
	const name = getValue(formData, "name");
	const description = getValue(formData, "description");
	const agentUrl = getValue(formData, "agentUrl");

	if (!environmentId || !name) {
		throw new Error("Environment and name are required");
	}

	await updateEnvironment({
		environmentId,
		userId,
		name,
		description,
		agentUrl,
	});

	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId,
		userId,
		actionType: "environment.update",
		details: {
			environmentId,
			environmentName: name,
			description: description || null,
			agentUrl: agentUrl || null,
		},
	});

	redirect(`/dashboard/environments/${environmentId}`);
}
