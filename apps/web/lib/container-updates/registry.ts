import "server-only";

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	normalizeDigest,
	parseBearerChallenge,
	parseLeadingMajor,
	parseRegistryImageReference,
} from "@/lib/container-updates/image-ref";

const DIGEST_CACHE_TTL_MS = 5 * 60_000;
const digestCache = new Map<string, { digest: string | null; expiresAt: number }>();

function getCachedDigest(imageRef: string): { hit: boolean; digest: string | null } {
	const entry = digestCache.get(imageRef);
	if (entry && Date.now() < entry.expiresAt) {
		return { hit: true, digest: entry.digest };
	}
	if (entry) {
		digestCache.delete(imageRef);
	}
	return { hit: false, digest: null };
}

function setCachedDigest(imageRef: string, digest: string | null) {
	digestCache.set(imageRef, { digest, expiresAt: Date.now() + DIGEST_CACHE_TTL_MS });
}

let dockerConfigCache: { config: Record<string, unknown> | null; expiresAt: number } | null = null;
const DOCKER_CONFIG_CACHE_TTL_MS = 60_000;

async function loadDockerConfig(): Promise<Record<string, unknown> | null> {
	if (dockerConfigCache && Date.now() < dockerConfigCache.expiresAt) {
		return dockerConfigCache.config;
	}
	try {
		const configPath = join(homedir(), ".docker", "config.json");
		const raw = await readFile(configPath, "utf-8");
		const config = JSON.parse(raw) as Record<string, unknown>;
		dockerConfigCache = { config, expiresAt: Date.now() + DOCKER_CONFIG_CACHE_TTL_MS };
		return config;
	} catch {
		dockerConfigCache = { config: null, expiresAt: Date.now() + DOCKER_CONFIG_CACHE_TTL_MS };
		return null;
	}
}

async function getDockerCredentials(registryHost: string): Promise<string | null> {
	const config = await loadDockerConfig();
	if (!config) {
		return null;
	}
	const auths = config.auths as Record<string, { auth?: string }> | undefined;
	if (!auths || typeof auths !== "object") {
		return null;
	}
	const candidates = [
		registryHost,
		`https://${registryHost}`,
		`https://${registryHost}/v1/`,
		`https://${registryHost}/v2/`,
	];
	for (const key of candidates) {
		const entry = auths[key];
		if (entry?.auth && typeof entry.auth === "string") {
			return entry.auth;
		}
	}
	return null;
}

export async function fetchRegistryManifestDigest(imageRef: string) {
	const cached = getCachedDigest(imageRef);
	if (cached.hit) {
		return cached.digest;
	}

	const parsed = parseRegistryImageReference(imageRef);
	if (!parsed) {
		return null;
	}
	const url = `https://${parsed.registryApiHost}/v2/${parsed.repository}/manifests/${encodeURIComponent(parsed.tag)}`;
	const accept =
		"application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json";

	const runRequest = async (token?: string) =>
		fetch(url, {
			method: "GET",
			headers: {
				accept,
				...(token ? { authorization: `Bearer ${token}` } : {}),
			},
			signal: AbortSignal.timeout(8000),
			cache: "no-store",
		});

	let response = await runRequest();
	if (response.status === 401) {
		const challenge = response.headers.get("www-authenticate") || "";
		const bearer = parseBearerChallenge(challenge);
		if (!bearer) {
			setCachedDigest(imageRef, null);
			return null;
		}
		const scope = bearer.scope || `repository:${parsed.repository}:pull`;
		const tokenUrl = new URL(bearer.realm);
		if (bearer.service) {
			tokenUrl.searchParams.set("service", bearer.service);
		}
		tokenUrl.searchParams.set("scope", scope);

		const credentials = await getDockerCredentials(parsed.registryHost);
		const tokenHeaders: Record<string, string> = {};
		if (credentials) {
			tokenHeaders.authorization = `Basic ${credentials}`;
		}

		const tokenResponse = await fetch(tokenUrl.toString(), {
			method: "GET",
			headers: tokenHeaders,
			signal: AbortSignal.timeout(8000),
			cache: "no-store",
		});
		if (!tokenResponse.ok) {
			setCachedDigest(imageRef, null);
			return null;
		}
		const tokenBody = (await tokenResponse.json().catch(() => null)) as {
			token?: string;
			access_token?: string;
		} | null;
		const token = tokenBody?.token || tokenBody?.access_token || "";
		if (!token) {
			setCachedDigest(imageRef, null);
			return null;
		}
		response = await runRequest(token);
	}
	if (!response.ok) {
		setCachedDigest(imageRef, null);
		return null;
	}
	const digest = normalizeDigest(response.headers.get("docker-content-digest") || "");
	setCachedDigest(imageRef, digest);
	return digest;
}

export async function findDockerHubMajorTargetTag(imageRef: string) {
	const parsed = parseRegistryImageReference(imageRef);
	if (!parsed || parsed.registryHost !== "docker.io") {
		return null;
	}
	const currentMajor = parseLeadingMajor(parsed.tag);
	if (currentMajor === null) {
		return null;
	}
	type Candidate = { tag: string; major: number };
	let bestExactMajor: Candidate | null = null;
	let bestFallback: Candidate | null = null;
	let nextUrl = `https://hub.docker.com/v2/repositories/${parsed.repository}/tags?page_size=100`;

	for (let page = 0; page < 3 && nextUrl; page += 1) {
		const response = await fetch(nextUrl, {
			method: "GET",
			signal: AbortSignal.timeout(8000),
			cache: "no-store",
		});
		if (!response.ok) {
			break;
		}
		const body = (await response.json().catch(() => null)) as {
			results?: Array<{ name?: string }>;
			next?: string | null;
		} | null;
		const tags = Array.isArray(body?.results) ? body.results : [];
		for (const entry of tags) {
			const tag = String(entry?.name || "").trim();
			if (!tag) {
				continue;
			}
			const major = parseLeadingMajor(tag);
			if (major === null || major <= currentMajor) {
				continue;
			}
			if (/^v?\d+$/i.test(tag)) {
				if (!bestExactMajor || major > bestExactMajor.major) {
					bestExactMajor = { tag, major };
				}
				continue;
			}
			if (!bestFallback || major > bestFallback.major) {
				bestFallback = { tag, major };
			}
		}
		nextUrl = body?.next || "";
	}

	return bestExactMajor?.tag || bestFallback?.tag || null;
}
