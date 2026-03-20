"use client";

import { io, type Socket } from "socket.io-client";
import msgpackParser from "socket.io-msgpack-parser";

let socket: Socket | null = null;

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

// --- Per-container stats ---

export function subscribeContainerStats(input: {
	containerId: string;
	environmentKind?: "local" | "agent";
	environmentId?: string;
}) {
	const client = getSocket();
	client.emit("container:stats:subscribe", input);
}

export function unsubscribeContainerStats(input: {
	containerId: string;
	environmentKind?: "local" | "agent";
	environmentId?: string;
}) {
	const client = getSocket();
	client.emit("container:stats:unsubscribe", input);
}

// --- Environment-level metrics (dashboard) ---

export function subscribeMetrics(input: {
	environmentId: string;
	environmentKind?: "local" | "agent";
}) {
	const client = getSocket();
	client.emit("metrics:subscribe", input);
}

export function unsubscribeMetrics(input: {
	environmentId: string;
	environmentKind?: "local" | "agent";
}) {
	if (!socket) return;
	socket.emit("metrics:unsubscribe", input);
}
