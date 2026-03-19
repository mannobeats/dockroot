"use client";

import { io, type Socket } from "socket.io-client";
import msgpackParser from "socket.io-msgpack-parser";

let socket: Socket | null = null;
let metricsRefCount = 0;

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

export function subscribeMetrics() {
	const client = getSocket();
	metricsRefCount += 1;
	if (metricsRefCount === 1) {
		client.emit("metrics:subscribe");
	}
}

export function unsubscribeMetrics() {
	metricsRefCount = Math.max(0, metricsRefCount - 1);
	if (metricsRefCount === 0 && socket) {
		socket.emit("metrics:unsubscribe");
	}
}
