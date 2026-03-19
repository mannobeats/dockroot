import { io } from "socket.io-client";
import msgpackParser from "socket.io-msgpack-parser";
import { metrics } from "./config.mjs";
import { getSnapshot } from "./docker.mjs";

let socket = null;
let connected = false;

export function startAgentWebSocket(state) {
	if (socket) {
		return;
	}

	const managerUrl = state.managerUrl || "";
	if (!managerUrl) {
		return;
	}

	socket = io(managerUrl, {
		path: "/socket.io",
		transports: ["websocket"],
		parser: msgpackParser,
		auth: {
			agentToken: state.agentToken,
			agentId: state.agentId,
			environmentId: state.environmentId,
		},
		reconnection: true,
		reconnectionDelay: 3_000,
		reconnectionDelayMax: 15_000,
	});

	socket.on("connect", () => {
		connected = true;
		metrics.connected = 1;
		console.log("[agent:ws] Connected to manager via WebSocket");

		socket.emit("agent:identify", {
			agentId: state.agentId,
			environmentId: state.environmentId,
		});
	});

	socket.on("disconnect", (reason) => {
		connected = false;
		metrics.connected = 0;
		console.log(`[agent:ws] Disconnected: ${reason}`);
	});

	socket.on("connect_error", (error) => {
		connected = false;
		metrics.connected = 0;
		console.error(`[agent:ws] Connection error: ${error.message}`);
	});

	// Hub-initiated pull: when the hub wants fresh metrics, it sends this event
	socket.on("agent:request-snapshot", async (requestId) => {
		try {
			const snapshot = await getSnapshot();
			socket.emit("agent:snapshot", {
				requestId,
				snapshot,
			});
		} catch (error) {
			console.error("[agent:ws] Failed to generate snapshot:", error.message);
			socket.emit("agent:snapshot", {
				requestId,
				error: error.message,
			});
		}
	});

	// Hub can request metrics at a specific interval
	socket.on("agent:start-streaming", (intervalMs) => {
		startMetricsStream(intervalMs || 2_000);
	});

	socket.on("agent:stop-streaming", () => {
		stopMetricsStream();
	});
}

let streamTimer = null;

function startMetricsStream(intervalMs) {
	stopMetricsStream();
	const tick = async () => {
		if (!connected || !socket) {
			return;
		}
		try {
			const snapshot = await getSnapshot();
			socket.emit("agent:metrics", {
				at: Date.now(),
				snapshot,
			});
		} catch (error) {
			console.error("[agent:ws] Metrics stream error:", error.message);
		}
	};
	void tick();
	streamTimer = setInterval(tick, Math.max(intervalMs, 1_000));
	streamTimer.unref?.();
}

function stopMetricsStream() {
	if (streamTimer) {
		clearInterval(streamTimer);
		streamTimer = null;
	}
}

export function stopAgentWebSocket() {
	stopMetricsStream();
	if (socket) {
		socket.disconnect();
		socket = null;
	}
	connected = false;
}

export function isAgentWebSocketConnected() {
	return connected;
}

export function getAgentSocket() {
	return socket;
}
