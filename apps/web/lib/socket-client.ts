"use client";

import { io, type Socket } from "socket.io-client";
import msgpackParser from "socket.io-msgpack-parser";

let socket: Socket | null = null;
const metricsRefCounts = new Map<string, number>();

type MetricsSubscriptionInput = {
	environmentId: string;
	environmentKind?: "local" | "agent";
};

function getMetricsSubscriptionKey(input: MetricsSubscriptionInput) {
	const normalizedKind = input.environmentKind === "agent" ? "agent" : "local";
	if (normalizedKind === "local") {
		return "local:local";
	}
	const normalizedId = String(input.environmentId || "").trim();
	return `${normalizedKind}:${normalizedId}`;
}

export function getSocket() {
	if (!socket) {
		socket = io({
			path: "/socket.io",
			transports: ["websocket"],
			parser: msgpackParser,
		});
	}

	return socket;
}

export function subscribeMetrics(input: MetricsSubscriptionInput) {
	const subscriptionKey = getMetricsSubscriptionKey(input);
	const client = getSocket();
	const current = metricsRefCounts.get(subscriptionKey) || 0;
	metricsRefCounts.set(subscriptionKey, current + 1);
	if (current === 0) {
		client.emit("metrics:subscribe", input);
	}
}

export function unsubscribeMetrics(input: MetricsSubscriptionInput) {
	const subscriptionKey = getMetricsSubscriptionKey(input);
	const current = metricsRefCounts.get(subscriptionKey) || 0;
	const next = Math.max(0, current - 1);
	if (next <= 0) {
		metricsRefCounts.delete(subscriptionKey);
		socket?.emit("metrics:unsubscribe", input);
		return;
	}

	metricsRefCounts.set(subscriptionKey, next);
}
