import type { RuntimeContainerRow, RuntimeStatsRow } from "./types";

export function addMinutes(date: Date, minutes: number) {
	return new Date(date.getTime() + minutes * 60_000);
}

export function formatTimelineTime(date: Date) {
	return date.toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

export function parsePercent(value: string | null | undefined) {
	const parsed = Number.parseFloat(
		String(value || "")
			.replace("%", "")
			.trim(),
	);
	return Number.isFinite(parsed) ? parsed : null;
}

export function parseHumanBytes(value: string | null | undefined) {
	const raw = String(value || "").trim();
	if (!raw) {
		return null;
	}

	const match = raw.match(/^([\d.]+)\s*([A-Za-z]+)?$/);
	if (!match) {
		return null;
	}

	const amount = Number.parseFloat(match[1]);
	if (!Number.isFinite(amount)) {
		return null;
	}

	const unit = (match[2] || "B").toUpperCase();
	const multipliers: Record<string, number> = {
		B: 1,
		BYTE: 1,
		BYTES: 1,
		KB: 1000,
		KIB: 1024,
		MB: 1000 ** 2,
		MIB: 1024 ** 2,
		GB: 1000 ** 3,
		GIB: 1024 ** 3,
		TB: 1000 ** 4,
		TIB: 1024 ** 4,
		PB: 1000 ** 5,
		PIB: 1024 ** 5,
	};

	const multiplier = multipliers[unit] ?? multipliers[unit.replace(/S$/, "")];
	if (!multiplier) {
		return null;
	}

	return Math.round(amount * multiplier);
}

export function parseMemoryUsage(value: string | null | undefined) {
	const [usage, limit] = String(value || "")
		.split("/")
		.map((part) => part.trim());

	return {
		usageBytes: parseHumanBytes(usage),
		limitBytes: parseHumanBytes(limit),
	};
}

export function parseNetIo(value: string | null | undefined) {
	const [rx, tx] = String(value || "")
		.split("/")
		.map((part) => part.trim());

	return {
		rxBytesTotal: parseHumanBytes(rx),
		txBytesTotal: parseHumanBytes(tx),
	};
}

export function toTenths(value: number | null | undefined) {
	if (!Number.isFinite(value)) {
		return null;
	}
	return Math.round(Number(value) * 10);
}

export function fromTenths(value: number | null | undefined) {
	if (!Number.isFinite(value)) {
		return null;
	}
	return Number(value) / 10;
}

export function pickContainerName(row: RuntimeContainerRow, statsRow?: RuntimeStatsRow) {
	return (
		String(row.Names || row.Name || statsRow?.Name || row.ID || statsRow?.ID || "").replace(
			/^\//,
			"",
		) || "unknown"
	);
}

export function buildSeries<T extends { sampledAt: Date }>(
	rows: T[],
	getValue: (row: T, index: number, source: T[]) => number | null,
) {
	return rows
		.map((row, index, source) => ({
			time: formatTimelineTime(row.sampledAt),
			value: getValue(row, index, source),
		}))
		.filter((point) => point.value !== null) as Array<{ time: string; value: number }>;
}

export function buildThroughputSeries(
	rows: Array<{
		sampledAt: Date;
		rxBytesTotal: number | null;
		txBytesTotal: number | null;
	}>,
	key: "rxBytesTotal" | "txBytesTotal",
) {
	const points: Array<{ time: string; value: number }> = [];
	for (let index = 1; index < rows.length; index += 1) {
		const previous = rows[index - 1];
		const current = rows[index];
		const previousValue = Number(previous[key] ?? 0);
		const currentValue = Number(current[key] ?? 0);
		const elapsedSeconds = Math.max(
			(current.sampledAt.getTime() - previous.sampledAt.getTime()) / 1000,
			1,
		);
		const delta = Math.max(0, currentValue - previousValue);
		points.push({
			time: formatTimelineTime(current.sampledAt),
			value: delta / elapsedSeconds,
		});
	}
	return points;
}

/**
 * Downsample a time series to at most `maxPoints` entries using LTTB-like
 * selection: keep first, last, and evenly-spaced samples in between.
 */
export function downsampleSeries<T>(series: T[], maxPoints: number): T[] {
	if (series.length <= maxPoints) {
		return series;
	}

	const result: T[] = [series[0]];
	const step = (series.length - 1) / (maxPoints - 1);
	for (let i = 1; i < maxPoints - 1; i++) {
		result.push(series[Math.round(i * step)]);
	}
	result.push(series[series.length - 1]);
	return result;
}
