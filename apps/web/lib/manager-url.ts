import "server-only";

import os from "node:os";
import { publicEnv } from "@/lib/public-env";

function trimTrailingSlash(value: string) {
	return value.replace(/\/$/, "");
}

export function isLoopbackHostname(hostname: string) {
	const normalized = hostname.trim().toLowerCase();
	return (
		normalized === "localhost" ||
		normalized === "127.0.0.1" ||
		normalized === "::1" ||
		normalized === "0.0.0.0" ||
		normalized === "[::]"
	);
}

function isPrivateIpv4(value: string) {
	return (
		/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value) ||
		/^192\.168\.\d{1,3}\.\d{1,3}$/.test(value) ||
		/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(value)
	);
}

function getPreferredLanIpv4() {
	const interfaces = os.networkInterfaces();
	const privateCandidates: string[] = [];
	const publicCandidates: string[] = [];

	for (const entries of Object.values(interfaces)) {
		for (const entry of entries || []) {
			if (!entry || entry.internal || entry.family !== "IPv4") {
				continue;
			}

			if (isPrivateIpv4(entry.address)) {
				privateCandidates.push(entry.address);
			} else {
				publicCandidates.push(entry.address);
			}
		}
	}

	return privateCandidates[0] || publicCandidates[0] || null;
}

function parseHeaderOrigin(headerValue: string | null | undefined, fallbackProtocol = "http") {
	if (!headerValue) {
		return null;
	}

	const value = headerValue.trim();
	if (!value) {
		return null;
	}

	try {
		return new URL(value.includes("://") ? value : `${fallbackProtocol}://${value}`);
	} catch {
		return null;
	}
}

export function inferRequestManagerUrl(headersLike: Pick<Headers, "get">) {
	const forwardedProto = headersLike.get("x-forwarded-proto") || "http";
	const forwardedHost = headersLike.get("x-forwarded-host");
	const host = headersLike.get("host");
	const originHeader = headersLike.get("origin");

	const parsed =
		parseHeaderOrigin(originHeader) ||
		parseHeaderOrigin(forwardedHost, forwardedProto) ||
		parseHeaderOrigin(host, forwardedProto);

	if (!parsed) {
		return null;
	}

	if (isLoopbackHostname(parsed.hostname)) {
		const lanIp = getPreferredLanIpv4();
		if (lanIp) {
			parsed.hostname = lanIp;
		}
	}

	if (!parsed.port && process.env.PORT) {
		parsed.port = process.env.PORT;
	}

	return trimTrailingSlash(parsed.toString());
}

export function resolveManagerUrl(input: {
	configuredUrl?: string | null;
	requestManagerUrl?: string | null;
}) {
	const configured = trimTrailingSlash(
		input.configuredUrl?.trim() || input.requestManagerUrl?.trim() || publicEnv.appUrl,
	);

	try {
		const configuredUrl = new URL(configured);
		if (!isLoopbackHostname(configuredUrl.hostname)) {
			return trimTrailingSlash(configuredUrl.toString());
		}
	} catch {
		// Ignore invalid configured values here; validation happens upstream.
	}

	if (input.requestManagerUrl) {
		return trimTrailingSlash(input.requestManagerUrl);
	}

	return trimTrailingSlash(configured);
}

export function inferAgentUrlFromHeaders(
	headersLike: Pick<Headers, "get">,
	port = Number(process.env.DOCKROOT_AGENT_PORT || "9095"),
) {
	const forwardedFor =
		headersLike.get("x-forwarded-for") ||
		headersLike.get("x-real-ip") ||
		headersLike.get("cf-connecting-ip");
	const clientIp = forwardedFor
		?.split(",")[0]
		?.trim()
		.replace(/^::ffff:/, "");
	if (!clientIp) {
		return null;
	}

	const protocol = headersLike.get("x-forwarded-proto") === "https" ? "https" : "http";
	return `${protocol}://${clientIp}:${port}`;
}
