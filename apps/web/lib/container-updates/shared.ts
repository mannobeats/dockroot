import "server-only";

export function now() {
	return new Date();
}

export function addMinutes(date: Date, minutes: number) {
	return new Date(date.getTime() + minutes * 60_000);
}

export function clampIntervalMinutes(value: number, fallback: number) {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	return Math.max(5, Math.min(24 * 60, Math.floor(value)));
}

export function containerNameOf(container: Record<string, string>) {
	return (container.Names || container.Name || "").trim();
}

export function containerStateOf(container: Record<string, string>) {
	return (container.State || "").trim().toLowerCase();
}

export function composeProjectOf(container: Record<string, string>) {
	const labels = container.Labels || "";
	return (
		labels
			.split(",")
			.find((entry) => entry.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=")
			.trim() || ""
	);
}

export function imageRefOf(
	container: Record<string, string>,
	inspect: Record<string, unknown> | null,
) {
	const inspectImage =
		inspect && typeof inspect.Config === "object" && inspect.Config
			? (inspect.Config as Record<string, unknown>).Image
			: null;
	if (typeof inspectImage === "string" && inspectImage.trim()) {
		return inspectImage.trim();
	}
	const rowImage = (container.Image || "").trim();
	return rowImage || null;
}

export function runningImageIdOf(inspect: Record<string, unknown> | null) {
	if (!inspect) {
		return null;
	}
	const image = inspect.Image;
	return typeof image === "string" && image.trim() ? image.trim() : null;
}

export function imageIdOf(image: unknown) {
	if (!image || typeof image !== "object") {
		return null;
	}
	const value = (image as Record<string, unknown>).Id || (image as Record<string, unknown>).id;
	return typeof value === "string" && value.trim() ? value.trim() : null;
}
