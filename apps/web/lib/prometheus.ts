import "server-only";

interface PrometheusValueResult {
	metric: Record<string, string>;
	value?: [number, string];
	values?: Array<[number, string]>;
}

interface PrometheusResponse {
	status: string;
	data?: {
		resultType: string;
		result: PrometheusValueResult[];
	};
}

function getPrometheusUrl() {
	return process.env.PROMETHEUS_URL || "http://localhost:9090";
}

async function queryPrometheus(path: string) {
	try {
		const response = await fetch(`${getPrometheusUrl()}${path}`, {
			cache: "no-store",
		});

		if (!response.ok) {
			return null;
		}

		return (await response.json()) as PrometheusResponse;
	} catch {
		return null;
	}
}

async function instantValue(query: string) {
	const response = await queryPrometheus(`/api/v1/query?query=${encodeURIComponent(query)}`);
	const value = response?.data?.result?.[0]?.value?.[1];

	return value ? Number.parseFloat(value) : null;
}

async function instantSeries(query: string) {
	const response = await queryPrometheus(`/api/v1/query?query=${encodeURIComponent(query)}`);

	return (
		response?.data?.result?.map((entry) => ({
			label:
				entry.metric.status ||
				entry.metric.service ||
				entry.metric.name ||
				entry.metric.instance ||
				"unknown",
			value: Number.parseFloat(entry.value?.[1] || "0"),
		})) || []
	);
}

async function rangeSeries(query: string, step = "30s", range = "30m") {
	const end = Math.floor(Date.now() / 1000);
	const start = end - 30 * 60;
	const response = await queryPrometheus(
		`/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${encodeURIComponent(step)}`,
	);

	const firstSeries = response?.data?.result?.[0]?.values || [];

	return firstSeries.map(([timestamp, value]) => ({
		time: new Date(timestamp * 1000).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		}),
		value: Number.parseFloat(value),
		range,
	}));
}

export async function getPrometheusDashboardMetrics() {
	const [
		cpuPercent,
		memoryPercent,
		runningContainers,
		deploymentStatus,
		environmentStatus,
		cpuSeries,
		memorySeries,
	] = await Promise.all([
		instantValue(
			`100 * (1 - avg(rate(node_cpu_seconds_total{job="node_exporter",mode="idle"}[5m])))`,
		),
		instantValue(
			`100 * (1 - (avg(node_memory_MemAvailable_bytes{job="node_exporter"}) / avg(node_memory_MemTotal_bytes{job="node_exporter"})))`,
		),
		instantValue(`dockroot_runtime_containers_running`),
		instantSeries(`dockroot_deployments_by_status`),
		instantSeries(`dockroot_environments_by_status`),
		rangeSeries(
			`100 * (1 - avg(rate(node_cpu_seconds_total{job="node_exporter",mode="idle"}[2m])))`,
		),
		rangeSeries(
			`100 * (1 - (avg(node_memory_MemAvailable_bytes{job="node_exporter"}) / avg(node_memory_MemTotal_bytes{job="node_exporter"})))`,
		),
	]);

	return {
		available: cpuPercent !== null || memoryPercent !== null,
		cpuPercent,
		memoryPercent,
		runningContainers,
		deploymentStatus,
		environmentStatus,
		cpuSeries,
		memorySeries,
	};
}
