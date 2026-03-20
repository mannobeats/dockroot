export function getMetricsRoom(environmentKey) {
	const normalized = String(environmentKey || "").trim() || "local";
	return `metrics:env:${normalized}`;
}
