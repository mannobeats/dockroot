function isPrivateIpv4Address(hostname: string) {
	return (
		/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
		/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
		/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
	);
}

function looksLikeContainerHostname(value: string | null | undefined) {
	return /^[a-f0-9]{12,64}$/i.test(String(value || "").trim());
}

function normalizeRuntimeUrl(value: string | undefined, urlLabel: string) {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error(`${urlLabel} must be a valid absolute URL.`);
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error(`${urlLabel} must use http or https.`);
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.search ||
		parsed.hash ||
		parsed.pathname !== "/"
	) {
		throw new Error(`${urlLabel} must not include credentials, query params, or a path.`);
	}

	return parsed.toString().replace(/\/$/, "");
}

export function normalizeAgentUrl(value: string | undefined) {
	return normalizeRuntimeUrl(value, "Agent URL");
}

export function normalizeManagerUrl(value: string | undefined) {
	return normalizeRuntimeUrl(value, "Manager URL");
}

export function resolveStoredAgentRuntimeUrl(input: {
	currentUrl?: string | null;
	inferredUrl?: string | null;
	hostname?: string | null;
}) {
	const normalizedCurrent = normalizeAgentUrl(input.currentUrl || undefined);
	const normalizedInferred = normalizeAgentUrl(input.inferredUrl || undefined);

	if (!normalizedCurrent) {
		return normalizedInferred;
	}

	if (!normalizedInferred || normalizedInferred === normalizedCurrent) {
		return normalizedCurrent;
	}

	try {
		const currentHost = new URL(normalizedCurrent).hostname;
		if (isPrivateIpv4Address(currentHost) && looksLikeContainerHostname(input.hostname)) {
			return normalizedInferred;
		}
	} catch {
		return normalizedInferred;
	}

	return normalizedCurrent;
}
