import "server-only";

import { db, deployments, environments, stacks } from "@dockroot/db";
import { count, eq } from "drizzle-orm";
import { Counter, collectDefaultMetrics, Gauge, type Registry, register } from "prom-client";
import { getLocalDockerSnapshot } from "@/lib/platform/docker";

let initialized = false;

const stackGauge = new Gauge({
	name: "dockroot_stacks_total",
	help: "Number of stacks visible to Dockroot",
	registers: [register],
});

const environmentGauge = new Gauge({
	name: "dockroot_environments_total",
	help: "Number of environments visible to Dockroot",
	registers: [register],
});

const deploymentGauge = new Gauge({
	name: "dockroot_deployments_total",
	help: "Number of deployments recorded by Dockroot",
	registers: [register],
});

const containerGauge = new Gauge({
	name: "dockroot_runtime_containers_total",
	help: "Number of Docker containers on the manager host",
	registers: [register],
});

const runningContainerGauge = new Gauge({
	name: "dockroot_runtime_containers_running",
	help: "Number of running Docker containers on the manager host",
	registers: [register],
});

const imageGauge = new Gauge({
	name: "dockroot_runtime_images_total",
	help: "Number of Docker images on the manager host",
	registers: [register],
});

const volumeGauge = new Gauge({
	name: "dockroot_runtime_volumes_total",
	help: "Number of Docker volumes on the manager host",
	registers: [register],
});

const networkGauge = new Gauge({
	name: "dockroot_runtime_networks_total",
	help: "Number of Docker networks on the manager host",
	registers: [register],
});

const deploymentStatusGauge = new Gauge({
	name: "dockroot_deployments_by_status",
	help: "Number of deployments per status",
	labelNames: ["status"],
	registers: [register],
});

const environmentStatusGauge = new Gauge({
	name: "dockroot_environments_by_status",
	help: "Number of environments per status",
	labelNames: ["status"],
	registers: [register],
});

const hostMemoryGauge = new Gauge({
	name: "dockroot_host_memory_used_bytes",
	help: "Used host memory on the manager host",
	registers: [register],
});

const hostMemoryTotalGauge = new Gauge({
	name: "dockroot_host_memory_total_bytes",
	help: "Total host memory on the manager host",
	registers: [register],
});

const deploymentEventsCounter = new Counter({
	name: "dockroot_deployment_events_total",
	help: "Count of deployment state transitions emitted by Dockroot",
	labelNames: ["status"],
	registers: [register],
});

export function initializeMonitoring() {
	if (initialized) {
		return;
	}

	collectDefaultMetrics({ register });
	initialized = true;
}

export function incrementDeploymentEvent(status: string) {
	initializeMonitoring();
	deploymentEventsCounter.inc({ status });
}

async function syncAppMetrics() {
	const [stackCount] = await db.select({ value: count() }).from(stacks);
	const [environmentCount] = await db.select({ value: count() }).from(environments);
	const [deploymentCount] = await db.select({ value: count() }).from(deployments);

	stackGauge.set(stackCount?.value ?? 0);
	environmentGauge.set(environmentCount?.value ?? 0);
	deploymentGauge.set(deploymentCount?.value ?? 0);

	for (const status of ["queued", "running", "succeeded", "failed"] as const) {
		const [statusCount] = await db
			.select({ value: count() })
			.from(deployments)
			.where(eq(deployments.status, status));

		deploymentStatusGauge.set({ status }, statusCount?.value ?? 0);
	}

	for (const status of ["provisioning", "healthy", "degraded", "offline"] as const) {
		const [statusCount] = await db
			.select({ value: count() })
			.from(environments)
			.where(eq(environments.status, status));

		environmentStatusGauge.set({ status }, statusCount?.value ?? 0);
	}

	const runtime = await getLocalDockerSnapshot();

	containerGauge.set(runtime.counts.containers);
	runningContainerGauge.set(runtime.counts.runningContainers);
	imageGauge.set(runtime.counts.images);
	volumeGauge.set(runtime.counts.volumes);
	networkGauge.set(runtime.counts.networks);
	hostMemoryTotalGauge.set(runtime.host.totalMemoryGb * 1024 * 1024 * 1024);
	hostMemoryGauge.set(
		(runtime.host.totalMemoryGb - runtime.host.freeMemoryGb) * 1024 * 1024 * 1024,
	);
}

export async function getMetricsRegistry(): Promise<Registry> {
	initializeMonitoring();
	await syncAppMetrics();
	return register;
}
