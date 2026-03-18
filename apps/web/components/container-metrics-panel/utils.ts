import type { ContainerMetrics } from "./types";

export function formatBytes(value: number | null) {
	if (value === null) {
		return "—";
	}

	const units = ["B", "KB", "MB", "GB"];
	let amount = value;
	let index = 0;

	while (amount >= 1024 && index < units.length - 1) {
		amount /= 1024;
		index += 1;
	}

	return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function safePercent(value: number | null) {
	return Math.max(0, Math.min(100, Number(value || 0)));
}

export function getMemoryUtilizationPercent(metrics: ContainerMetrics) {
	const maxMemorySample = metrics.memorySeries.reduce((max, point) => {
		return Math.max(max, point.value);
	}, metrics.memoryBytes || 0);
	const hasReliableLimit =
		Number.isFinite(metrics.memoryLimitBytes) &&
		(metrics.memoryLimitBytes || 0) > 0 &&
		(metrics.memoryLimitBytes || 0) < 9_000_000_000_000_000;

	const memoryUtilizationPercent = hasReliableLimit
		? ((metrics.memoryBytes || 0) / (metrics.memoryLimitBytes || 1)) * 100
		: maxMemorySample > 0
			? ((metrics.memoryBytes || 0) / maxMemorySample) * 100
			: 0;

	return {
		hasReliableLimit,
		memoryUtilizationPercent,
	};
}
