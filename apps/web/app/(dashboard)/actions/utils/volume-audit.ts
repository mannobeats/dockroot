export async function recordVolumeAuditEvent(input: {
	environmentId?: string;
	userId: string;
	actionType: string;
	details?: Record<string, unknown>;
}) {
	const { recordAuditEvent } = await import("@/lib/platform");
	await recordAuditEvent({
		environmentId: input.environmentId,
		userId: input.userId,
		actionType: input.actionType,
		details: input.details,
	});
}
