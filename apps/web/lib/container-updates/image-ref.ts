import "server-only";

export function normalizeDigest(value: string) {
	const raw = value.trim();
	if (!raw) {
		return null;
	}
	const at = raw.lastIndexOf("@");
	const digest = at >= 0 ? raw.slice(at + 1) : raw;
	return digest.startsWith("sha256:") ? digest : null;
}

export function digestSetFromImageInspect(image: unknown) {
	const set = new Set<string>();
	if (!image || typeof image !== "object") {
		return set;
	}
	const record = image as Record<string, unknown>;
	const repoDigests = Array.isArray(record.RepoDigests) ? record.RepoDigests : [];
	for (const value of repoDigests) {
		if (typeof value !== "string") {
			continue;
		}
		const digest = normalizeDigest(value);
		if (digest) {
			set.add(digest);
		}
	}
	const imageId = normalizeDigest(String(record.Id || record.ID || ""));
	if (imageId) {
		set.add(imageId);
	}
	return set;
}

export function hasSharedDigest(a: Set<string>, b: Set<string>) {
	for (const digest of a) {
		if (b.has(digest)) {
			return true;
		}
	}
	return false;
}

export function hasContainerImageUpdate(input: {
	runningImageId: string | null;
	latestImageId: string | null;
	runningImageInspect: unknown;
	latestImageInspect: unknown;
}) {
	const runningDigests = digestSetFromImageInspect(input.runningImageInspect);
	const latestDigests = digestSetFromImageInspect(input.latestImageInspect);
	if (runningDigests.size > 0 && latestDigests.size > 0) {
		return !hasSharedDigest(runningDigests, latestDigests);
	}
	return Boolean(
		input.runningImageId &&
			input.latestImageId &&
			input.runningImageId.trim() &&
			input.latestImageId.trim() &&
			input.runningImageId !== input.latestImageId,
	);
}

export function parseImageReference(imageRef: string) {
	const value = imageRef.trim();
	if (!value || value.includes("@")) {
		return null;
	}
	const lastSlash = value.lastIndexOf("/");
	const lastColon = value.lastIndexOf(":");
	if (lastColon > lastSlash) {
		return {
			repository: value.slice(0, lastColon),
			tag: value.slice(lastColon + 1),
		};
	}
	return null;
}

export function latestImageReferenceForMajorCheck(imageRef: string) {
	const parsed = parseImageReference(imageRef);
	if (!parsed || !parsed.repository || !parsed.tag || parsed.tag === "latest") {
		return null;
	}
	return `${parsed.repository}:latest`;
}

export function parseRegistryImageReference(imageRef: string) {
	const parsed = parseImageReference(imageRef);
	if (!parsed) {
		return null;
	}
	const name = parsed.repository;
	const segments = name.split("/");
	const first = segments[0] || "";
	const hasRegistry = first.includes(".") || first.includes(":") || first === "localhost";
	const registryHost = hasRegistry ? first : "docker.io";
	let repository = hasRegistry ? segments.slice(1).join("/") : name;
	if (!repository) {
		return null;
	}
	if (registryHost === "docker.io" && !repository.includes("/")) {
		repository = `library/${repository}`;
	}
	return {
		registryHost,
		registryApiHost: registryHost === "docker.io" ? "registry-1.docker.io" : registryHost,
		repository,
		tag: parsed.tag,
	};
}

export function parseBearerChallenge(challenge: string) {
	const [scheme, rest] = challenge.split(/\s+/, 2);
	if (!scheme || scheme.toLowerCase() !== "bearer" || !rest) {
		return null;
	}
	const params: Record<string, string> = {};
	for (const match of rest.matchAll(/([a-zA-Z]+)="([^"]*)"/g)) {
		params[match[1].toLowerCase()] = match[2];
	}
	if (!params.realm) {
		return null;
	}
	return params;
}

export function parseLeadingMajor(tag: string) {
	const match = tag.trim().match(/^v?(\d+)/i);
	if (!match) {
		return null;
	}
	return Number(match[1]);
}
