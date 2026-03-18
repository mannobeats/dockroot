import path from "node:path";

export const managerUrl = (
	process.env.DOCKROOT_MANAGER_URL ||
	process.env.MANAGER_URL ||
	""
).replace(/\/$/, "");
export const registrationToken =
	process.env.DOCKROOT_AGENT_REGISTRATION_TOKEN || process.env.REGISTRATION_TOKEN || "";
export const dataDir = process.env.DOCKROOT_AGENT_DATA_DIR || "/var/lib/dockroot-agent";
export const listenPort = Number(process.env.DOCKROOT_AGENT_PORT || 9095);
export const pollIntervalMs = Math.max(
	2000,
	Number(process.env.DOCKROOT_AGENT_POLL_INTERVAL_MS || 10000),
);
export const statePath = path.join(dataDir, "state.json");
export const stacksDir = path.join(dataDir, "stacks");

export const metrics = {
	registered: 0,
	connected: 0,
	lastHeartbeatTimestampSeconds: 0,
	lastJobFinishedTimestampSeconds: 0,
	lastPollTimestampSeconds: 0,
	jobsSucceeded: 0,
	jobsFailed: 0,
};
