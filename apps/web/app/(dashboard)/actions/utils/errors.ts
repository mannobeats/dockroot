export function normalizeInUseDeleteError(
	resource: "image" | "volume" | "network",
	target: string,
	error: unknown,
) {
	const message = error instanceof Error ? error.message : String(error || "");
	const lower = message.toLowerCase();
	if (resource === "image") {
		if (
			lower.includes("being used by running container") ||
			lower.includes("being used by stopped container") ||
			lower.includes("image is being used")
		) {
			return new Error(`Cannot delete image ${target}: it is in use by one or more containers.`);
		}
	}
	if (resource === "volume") {
		if (lower.includes("volume is in use") || lower.includes("has active mounts")) {
			return new Error(
				`Cannot delete volume ${target}: it is currently attached to one or more containers.`,
			);
		}
	}
	if (resource === "network") {
		if (lower.includes("has active endpoints") || lower.includes("resource is in use")) {
			return new Error(
				`Cannot delete network ${target}: one or more containers are still connected to it.`,
			);
		}
	}
	return error instanceof Error ? error : new Error(message || "Action failed.");
}
