import "server-only";

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
	containerUpdatePolicies,
	containerUpdateRuns,
	containerUpdateSchedules,
	containerUpdateStates,
	db,
	environments,
	stacks,
} from "@dockroot/db";
import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import {
	getContainerDetailsForEnvironment,
	getImageDetailsForEnvironment,
	listContainersForEnvironment,
	pullImageForEnvironment,
	resolveRuntimeEnvironment,
} from "@/lib/environment-runtime";
import { queueOrRunDeployment } from "@/lib/platform";
import { isProtectedManagerContainer } from "@/lib/runtime-protection";

function now() {
	return new Date();
}

function addMinutes(date: Date, minutes: number) {
	return new Date(date.getTime() + minutes * 60_000);
}

function clampIntervalMinutes(value: number, fallback: number) {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	return Math.max(5, Math.min(24 * 60, Math.floor(value)));
}

function containerNameOf(container: Record<string, string>) {
	return (container.Names || container.Name || "").trim();
}

function containerStateOf(container: Record<string, string>) {
	return (container.State || "").trim().toLowerCase();
}

function composeProjectOf(container: Record<string, string>) {
	const labels = container.Labels || "";
	return (
		labels
			.split(",")
			.find((entry) => entry.startsWith("com.docker.compose.project="))
			?.split("=")
			.slice(1)
			.join("=")
			.trim() || ""
	);
}

function imageRefOf(container: Record<string, string>, inspect: Record<string, unknown> | null) {
	const inspectImage =
		inspect && typeof inspect.Config === "object" && inspect.Config
			? (inspect.Config as Record<string, unknown>).Image
			: null;
	if (typeof inspectImage === "string" && inspectImage.trim()) {
		return inspectImage.trim();
	}
	const rowImage = (container.Image || "").trim();
	return rowImage || null;
}

function runningImageIdOf(inspect: Record<string, unknown> | null) {
	if (!inspect) {
		return null;
	}
	const image = inspect.Image;
	return typeof image === "string" && image.trim() ? image.trim() : null;
}

function imageIdOf(image: unknown) {
	if (!image || typeof image !== "object") {
		return null;
	}
	const value = (image as Record<string, unknown>).Id || (image as Record<string, unknown>).id;
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDigest(value: string) {
	const raw = value.trim();
	if (!raw) {
		return null;
	}
	const at = raw.lastIndexOf("@");
	const digest = at >= 0 ? raw.slice(at + 1) : raw;
	return digest.startsWith("sha256:") ? digest : null;
}

function digestSetFromImageInspect(image: unknown) {
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

function hasSharedDigest(a: Set<string>, b: Set<string>) {
	for (const digest of a) {
		if (b.has(digest)) {
			return true;
		}
	}
	return false;
}

function hasContainerImageUpdate(input: {
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

type ContainerUpdateCheckSummary = {
	totalContainers: number;
	checkedContainers: number;
	availableContainers: number;
	skippedContainers: number;
	failedContainers: number;
};

type ContainerUpdateApplySummary = {
	totalContainers: number;
	updatedContainers: number;
	queuedStacks: number;
	skippedContainers: number;
	failedContainers: number;
};

type ContainerUpdatePolicyMap = Map<
	string,
	{
		id: string;
		checkEnabled: boolean;
		updateEnabled: boolean;
	}
>;

type ContainerUpdateStateMap = Map<
	string,
	{
		id: string;
		updateAvailable: boolean;
		majorUpdateAvailable: boolean;
		majorTargetImageRef: string | null;
		majorTargetTag: string | null;
		lastResult: string | null;
		lastError: string | null;
		checkedAt: Date | null;
		updatedAt: Date | null;
	}
>;

type ContainerUpdateCheckMode = (typeof containerUpdateSchedules.$inferInsert)["checkMode"];

function parseImageReference(imageRef: string) {
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

function latestImageReferenceForMajorCheck(imageRef: string) {
	const parsed = parseImageReference(imageRef);
	if (!parsed || !parsed.repository || !parsed.tag || parsed.tag === "latest") {
		return null;
	}
	return `${parsed.repository}:latest`;
}

function parseRegistryImageReference(imageRef: string) {
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

function parseBearerChallenge(challenge: string) {
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

function parseLeadingMajor(tag: string) {
	const match = tag.trim().match(/^v?(\d+)/i);
	if (!match) {
		return null;
	}
	return Number(match[1]);
}

// ---------------------------------------------------------------------------
// Digest cache – avoids redundant registry round-trips within a short window
// ---------------------------------------------------------------------------
const DIGEST_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
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

// ---------------------------------------------------------------------------
// Docker credential helper – reads ~/.docker/config.json for private registries
// ---------------------------------------------------------------------------
let dockerConfigCache: { config: Record<string, unknown> | null; expiresAt: number } | null = null;
const DOCKER_CONFIG_CACHE_TTL_MS = 60_000; // re-read at most every minute

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
	// Try exact match first, then common variations
	const candidates = [
		registryHost,
		`https://${registryHost}`,
		`https://${registryHost}/v1/`,
		`https://${registryHost}/v2/`,
	];
	for (const key of candidates) {
		const entry = auths[key];
		if (entry?.auth && typeof entry.auth === "string") {
			return entry.auth; // base64-encoded "user:pass"
		}
	}
	return null;
}

async function fetchRegistryManifestDigest(imageRef: string) {
	// Check cache first
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

		// For private registries, pass Docker credentials as Basic auth when fetching the bearer token
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

async function findDockerHubMajorTargetTag(imageRef: string) {
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

export async function getOrCreateContainerUpdateSchedule(userId: string, environmentId?: string) {
	const environment = await resolveRuntimeEnvironment(userId, environmentId);
	const existing = await db.query.containerUpdateSchedules.findFirst({
		where: and(
			eq(containerUpdateSchedules.environmentId, environment.id),
			eq(containerUpdateSchedules.createdByUserId, userId),
		),
	});

	if (existing) {
		return existing;
	}

	const createdAt = now();
	const scheduleId = randomUUID();
	const row = {
		id: scheduleId,
		environmentId: environment.id,
		autoCheckEnabled: false,
		autoUpdateEnabled: false,
		checkMode: "same_tag" as const,
		checkIntervalMinutes: 60,
		updateIntervalMinutes: 240,
		pullBeforeCheck: true,
		updateOnlyRunning: true,
		nextCheckAt: null,
		nextUpdateAt: null,
		lastCheckAt: null,
		lastUpdateAt: null,
		runningLeaseUntil: null,
		runningWorkerId: null,
		createdByUserId: userId,
		createdAt,
		updatedAt: createdAt,
	};

	await db
		.insert(containerUpdateSchedules)
		.values(row)
		.onConflictDoNothing({
			target: [containerUpdateSchedules.environmentId, containerUpdateSchedules.createdByUserId],
		});

	const hydrated = await db.query.containerUpdateSchedules.findFirst({
		where: and(
			eq(containerUpdateSchedules.environmentId, environment.id),
			eq(containerUpdateSchedules.createdByUserId, userId),
		),
	});

	if (!hydrated) {
		throw new Error("Unable to create update schedule.");
	}

	return hydrated;
}

export async function updateContainerUpdateSchedule(input: {
	userId: string;
	environmentId: string;
	checkMode: ContainerUpdateCheckMode;
	autoCheckEnabled: boolean;
	autoUpdateEnabled: boolean;
	checkIntervalMinutes: number;
	updateIntervalMinutes: number;
	pullBeforeCheck: boolean;
	updateOnlyRunning: boolean;
}) {
	const environment = await db.query.environments.findFirst({
		where: and(
			eq(environments.id, input.environmentId),
			eq(environments.createdByUserId, input.userId),
		),
		columns: { id: true },
	});
	if (!environment) {
		throw new Error("Environment not found.");
	}

	const existing = await getOrCreateContainerUpdateSchedule(input.userId, input.environmentId);
	const updatedAt = now();
	const checkIntervalMinutes = clampIntervalMinutes(input.checkIntervalMinutes, 60);
	const updateIntervalMinutes = clampIntervalMinutes(input.updateIntervalMinutes, 240);

	await db
		.update(containerUpdateSchedules)
		.set({
			autoCheckEnabled: input.autoCheckEnabled,
			autoUpdateEnabled: input.autoUpdateEnabled,
			checkMode: input.checkMode,
			checkIntervalMinutes,
			updateIntervalMinutes,
			pullBeforeCheck: input.pullBeforeCheck,
			updateOnlyRunning: input.updateOnlyRunning,
			nextCheckAt: input.autoCheckEnabled
				? existing.nextCheckAt && existing.nextCheckAt > updatedAt
					? existing.nextCheckAt
					: addMinutes(updatedAt, checkIntervalMinutes)
				: null,
			nextUpdateAt: input.autoUpdateEnabled
				? existing.nextUpdateAt && existing.nextUpdateAt > updatedAt
					? existing.nextUpdateAt
					: addMinutes(updatedAt, updateIntervalMinutes)
				: null,
			updatedAt,
		})
		.where(eq(containerUpdateSchedules.id, existing.id));
}

export async function listContainerUpdateRuns(input: {
	userId: string;
	environmentId?: string;
	limit?: number;
}) {
	const environment = await resolveRuntimeEnvironment(input.userId, input.environmentId);
	return db.query.containerUpdateRuns.findMany({
		where: and(
			eq(containerUpdateRuns.environmentId, environment.id),
			eq(containerUpdateRuns.createdByUserId, input.userId),
		),
		orderBy: [desc(containerUpdateRuns.startedAt)],
		limit: Math.max(1, Math.min(50, input.limit || 20)),
	});
}

export async function getContainerUpdatePolicyMap(userId: string, environmentId?: string) {
	const environment = await resolveRuntimeEnvironment(userId, environmentId);
	const rows = await db.query.containerUpdatePolicies.findMany({
		where: and(
			eq(containerUpdatePolicies.environmentId, environment.id),
			eq(containerUpdatePolicies.createdByUserId, userId),
		),
	});

	const map: ContainerUpdatePolicyMap = new Map();
	for (const row of rows) {
		map.set(row.containerName, {
			id: row.id,
			checkEnabled: row.checkEnabled,
			updateEnabled: row.updateEnabled,
		});
	}
	return { environment, map };
}

export async function getContainerUpdateStateMap(userId: string, environmentId?: string) {
	const environment = await resolveRuntimeEnvironment(userId, environmentId);
	const rows = await db.query.containerUpdateStates.findMany({
		where: and(
			eq(containerUpdateStates.environmentId, environment.id),
			eq(containerUpdateStates.createdByUserId, userId),
		),
	});
	const map: ContainerUpdateStateMap = new Map();
	for (const row of rows) {
		map.set(row.containerName, {
			id: row.id,
			updateAvailable: row.updateAvailable,
			majorUpdateAvailable: row.majorUpdateAvailable,
			majorTargetImageRef: row.majorTargetImageRef || null,
			majorTargetTag: row.majorTargetTag || null,
			lastResult: row.lastResult || null,
			lastError: row.lastError || null,
			checkedAt: row.checkedAt || null,
			updatedAt: row.updatedAt || null,
		});
	}
	return { environment, map };
}

export async function setContainerUpdatePolicy(input: {
	userId: string;
	environmentId?: string;
	containerName: string;
	checkEnabled?: boolean;
	updateEnabled?: boolean;
}) {
	const environment = await resolveRuntimeEnvironment(input.userId, input.environmentId);
	const containerName = input.containerName.trim();
	if (!containerName) {
		throw new Error("Container name is required.");
	}

	const existing = await db.query.containerUpdatePolicies.findFirst({
		where: and(
			eq(containerUpdatePolicies.environmentId, environment.id),
			eq(containerUpdatePolicies.createdByUserId, input.userId),
			eq(containerUpdatePolicies.containerName, containerName),
		),
	});

	const createdAt = now();
	const target = {
		checkEnabled: input.checkEnabled ?? existing?.checkEnabled ?? true,
		updateEnabled: input.updateEnabled ?? existing?.updateEnabled ?? false,
	};

	if (existing) {
		await db
			.update(containerUpdatePolicies)
			.set({
				checkEnabled: target.checkEnabled,
				updateEnabled: target.updateEnabled,
				updatedAt: createdAt,
			})
			.where(eq(containerUpdatePolicies.id, existing.id));
		return;
	}

	await db.insert(containerUpdatePolicies).values({
		id: randomUUID(),
		environmentId: environment.id,
		containerName,
		checkEnabled: target.checkEnabled,
		updateEnabled: target.updateEnabled,
		createdByUserId: input.userId,
		createdAt,
		updatedAt: createdAt,
	});
}

async function upsertContainerUpdateState(input: {
	userId: string;
	environmentId: string;
	containerName: string;
	containerId?: string | null;
	imageRef?: string | null;
	runningImageId?: string | null;
	latestImageId?: string | null;
	majorTargetImageRef?: string | null;
	majorTargetTag?: string | null;
	updateAvailable: boolean;
	majorUpdateAvailable?: boolean;
	lastResult: (typeof containerUpdateStates.$inferInsert)["lastResult"];
	lastError?: string | null;
	checkedAt?: Date | null;
	updatedAt?: Date | null;
}) {
	const existing = await db.query.containerUpdateStates.findFirst({
		where: and(
			eq(containerUpdateStates.environmentId, input.environmentId),
			eq(containerUpdateStates.createdByUserId, input.userId),
			eq(containerUpdateStates.containerName, input.containerName),
		),
	});
	const createdAt = now();

	if (existing) {
		await db
			.update(containerUpdateStates)
			.set({
				containerId: input.containerId || null,
				imageRef: input.imageRef || null,
				runningImageId: input.runningImageId || null,
				latestImageId: input.latestImageId || null,
				majorTargetImageRef:
					input.majorTargetImageRef === undefined
						? existing.majorTargetImageRef
						: input.majorTargetImageRef || null,
				majorTargetTag:
					input.majorTargetTag === undefined
						? existing.majorTargetTag
						: input.majorTargetTag || null,
				updateAvailable: input.updateAvailable,
				majorUpdateAvailable: input.majorUpdateAvailable ?? existing.majorUpdateAvailable,
				lastResult: input.lastResult,
				lastError: input.lastError || null,
				checkedAt: input.checkedAt || existing.checkedAt,
				updatedAt: input.updatedAt || existing.updatedAt,
				modifiedAt: createdAt,
			})
			.where(eq(containerUpdateStates.id, existing.id));
		return;
	}

	await db.insert(containerUpdateStates).values({
		id: randomUUID(),
		environmentId: input.environmentId,
		containerName: input.containerName,
		containerId: input.containerId || null,
		imageRef: input.imageRef || null,
		runningImageId: input.runningImageId || null,
		latestImageId: input.latestImageId || null,
		majorTargetImageRef: input.majorTargetImageRef || null,
		majorTargetTag: input.majorTargetTag || null,
		updateAvailable: input.updateAvailable,
		majorUpdateAvailable: input.majorUpdateAvailable ?? false,
		lastResult: input.lastResult,
		lastError: input.lastError || null,
		checkedAt: input.checkedAt || null,
		updatedAt: input.updatedAt || null,
		createdByUserId: input.userId,
		createdAt,
		modifiedAt: createdAt,
	});
}

async function createUpdateRun(input: {
	userId: string;
	environmentId: string;
	runType: "check" | "update";
	scheduleId?: string | null;
}) {
	const createdAt = now();
	const runId = randomUUID();
	await db.insert(containerUpdateRuns).values({
		id: runId,
		scheduleId: input.scheduleId || null,
		environmentId: input.environmentId,
		runType: input.runType,
		status: "running",
		totalContainers: 0,
		checkedContainers: 0,
		availableContainers: 0,
		queuedStacks: 0,
		updatedContainers: 0,
		skippedContainers: 0,
		failedContainers: 0,
		summary: null,
		error: null,
		startedAt: createdAt,
		finishedAt: null,
		createdByUserId: input.userId,
		createdAt,
		updatedAt: createdAt,
	});
	return runId;
}

async function completeUpdateRun(input: {
	runId: string;
	status: "succeeded" | "failed";
	summary: string;
	error?: string;
	metrics: {
		totalContainers: number;
		checkedContainers: number;
		availableContainers: number;
		queuedStacks: number;
		updatedContainers: number;
		skippedContainers: number;
		failedContainers: number;
	};
}) {
	const updatedAt = now();
	await db
		.update(containerUpdateRuns)
		.set({
			status: input.status,
			summary: input.summary,
			error: input.error || null,
			totalContainers: input.metrics.totalContainers,
			checkedContainers: input.metrics.checkedContainers,
			availableContainers: input.metrics.availableContainers,
			queuedStacks: input.metrics.queuedStacks,
			updatedContainers: input.metrics.updatedContainers,
			skippedContainers: input.metrics.skippedContainers,
			failedContainers: input.metrics.failedContainers,
			finishedAt: updatedAt,
			updatedAt,
		})
		.where(eq(containerUpdateRuns.id, input.runId));
}

async function ensurePoliciesForContainers(input: {
	userId: string;
	environmentId: string;
	containers: Array<Record<string, string>>;
}) {
	const rows = input.containers
		.map((container) => containerNameOf(container))
		.filter(Boolean)
		.map((containerName) => ({
			id: randomUUID(),
			environmentId: input.environmentId,
			containerName,
			checkEnabled: true,
			updateEnabled: false,
			createdByUserId: input.userId,
			createdAt: now(),
			updatedAt: now(),
		}));

	if (!rows.length) {
		return;
	}

	await db
		.insert(containerUpdatePolicies)
		.values(rows)
		.onConflictDoNothing({
			target: [
				containerUpdatePolicies.environmentId,
				containerUpdatePolicies.createdByUserId,
				containerUpdatePolicies.containerName,
			],
		});
}

export async function runContainerUpdateCheck(input: {
	userId: string;
	environmentId?: string;
	containerNames?: string[];
	respectPolicies?: boolean;
	pullBeforeCheck?: boolean;
	includeMajorVersions?: boolean;
	scheduleId?: string | null;
}) {
	const environment = await resolveRuntimeEnvironment(input.userId, input.environmentId);
	const runId = await createUpdateRun({
		userId: input.userId,
		environmentId: environment.id,
		runType: "check",
		scheduleId: input.scheduleId || null,
	});
	const pullBeforeCheck = input.pullBeforeCheck ?? true;
	const respectPolicies = input.respectPolicies ?? false;
	const includeMajorVersions = input.includeMajorVersions ?? false;

	try {
		const { containers } = await listContainersForEnvironment(input.userId, environment.id);
		await ensurePoliciesForContainers({
			userId: input.userId,
			environmentId: environment.id,
			containers,
		});

		const requested = new Set(
			(input.containerNames || []).map((name) => name.trim()).filter(Boolean),
		);
		const targetContainers = containers.filter((container: Record<string, string>) => {
			const containerName = containerNameOf(container);
			if (!containerName) {
				return false;
			}
			if (!requested.size) {
				return true;
			}
			return requested.has(containerName);
		});
		const policyRows = await db.query.containerUpdatePolicies.findMany({
			where: and(
				eq(containerUpdatePolicies.environmentId, environment.id),
				eq(containerUpdatePolicies.createdByUserId, input.userId),
			),
		});
		const policies: ContainerUpdatePolicyMap = new Map(
			policyRows.map((row) => [
				row.containerName,
				{ id: row.id, checkEnabled: row.checkEnabled, updateEnabled: row.updateEnabled },
			]),
		);

		const summary: ContainerUpdateCheckSummary = {
			totalContainers: targetContainers.length,
			checkedContainers: 0,
			availableContainers: 0,
			skippedContainers: 0,
			failedContainers: 0,
		};

		for (const container of targetContainers) {
			const containerName = containerNameOf(container);
			if (!containerName) {
				summary.skippedContainers += 1;
				continue;
			}

			const policy = policies.get(containerName);
			if (respectPolicies && policy && !policy.checkEnabled) {
				summary.skippedContainers += 1;
				continue;
			}
			if (environment.kind === "local" && isProtectedManagerContainer(container)) {
				await upsertContainerUpdateState({
					userId: input.userId,
					environmentId: environment.id,
					containerName,
					containerId: container.ID,
					imageRef: container.Image || null,
					runningImageId: null,
					latestImageId: null,
					majorTargetImageRef: null,
					majorTargetTag: null,
					updateAvailable: false,
					majorUpdateAvailable: false,
					lastResult: "skipped",
					lastError: null,
					checkedAt: now(),
				});
				summary.skippedContainers += 1;
				continue;
			}

			try {
				const details = await getContainerDetailsForEnvironment(
					input.userId,
					container.ID,
					environment.id,
				);
				const inspect = (details.details?.inspect || null) as Record<string, unknown> | null;
				const imageRef = imageRefOf(container, inspect);
				const runningImageId = runningImageIdOf(inspect);
				if (!imageRef) {
					await upsertContainerUpdateState({
						userId: input.userId,
						environmentId: environment.id,
						containerName,
						containerId: container.ID,
						imageRef: null,
						runningImageId,
						latestImageId: null,
						majorTargetImageRef: null,
						majorTargetTag: null,
						updateAvailable: false,
						majorUpdateAvailable: false,
						lastResult: "skipped",
						lastError: "Container has no image reference.",
						checkedAt: now(),
					});
					summary.skippedContainers += 1;
					continue;
				}

				if (pullBeforeCheck) {
					await pullImageForEnvironment(input.userId, imageRef, environment.id);
				}
				let runningImageInspect: Record<string, unknown> | null = null;
				if (runningImageId) {
					try {
						const runningImage = await getImageDetailsForEnvironment(
							input.userId,
							runningImageId,
							environment.id,
						);
						runningImageInspect = (runningImage.image || null) as Record<string, unknown> | null;
					} catch {
						runningImageInspect = null;
					}
				}
				let latestImageId: string | null = null;
				let latestImageInspect: Record<string, unknown> | null = null;
				let updateAvailable = false;
				if (!pullBeforeCheck) {
					const remoteDigest = await fetchRegistryManifestDigest(imageRef);
					if (remoteDigest) {
						latestImageId = remoteDigest;
						const runningDigests = digestSetFromImageInspect(runningImageInspect);
						const normalizedRunningImageId = normalizeDigest(runningImageId || "");
						if (normalizedRunningImageId) {
							runningDigests.add(normalizedRunningImageId);
						}
						updateAvailable = !runningDigests.has(remoteDigest);
					}
				}
				if (!latestImageId) {
					const latestImage = await getImageDetailsForEnvironment(
						input.userId,
						imageRef,
						environment.id,
					);
					latestImageId = imageIdOf(latestImage.image);
					latestImageInspect = (latestImage.image || null) as Record<string, unknown> | null;
					updateAvailable = hasContainerImageUpdate({
						runningImageId,
						latestImageId,
						runningImageInspect,
						latestImageInspect,
					});
				}
				let majorUpdateAvailable = false;
				let majorTargetImageRef: string | null = null;
				let majorTargetTag: string | null = null;
				if (!updateAvailable && includeMajorVersions && runningImageId) {
					const latestRef = latestImageReferenceForMajorCheck(imageRef);
					if (latestRef) {
						try {
							majorTargetImageRef = latestRef;
							if (pullBeforeCheck) {
								await pullImageForEnvironment(input.userId, latestRef, environment.id);
								const majorCandidate = await getImageDetailsForEnvironment(
									input.userId,
									latestRef,
									environment.id,
								);
								const majorCandidateId = imageIdOf(majorCandidate.image);
								const majorCandidateInspect = (majorCandidate.image || null) as Record<
									string,
									unknown
								> | null;
								majorUpdateAvailable = hasContainerImageUpdate({
									runningImageId,
									latestImageId: majorCandidateId,
									runningImageInspect,
									latestImageInspect: majorCandidateInspect,
								});
							} else {
								const remoteDigest = await fetchRegistryManifestDigest(latestRef);
								if (remoteDigest) {
									const runningDigests = digestSetFromImageInspect(runningImageInspect);
									const normalizedRunningImageId = normalizeDigest(runningImageId || "");
									if (normalizedRunningImageId) {
										runningDigests.add(normalizedRunningImageId);
									}
									majorUpdateAvailable = !runningDigests.has(remoteDigest);
								}
							}
							if (majorUpdateAvailable) {
								const candidateTag = await findDockerHubMajorTargetTag(imageRef);
								if (candidateTag) {
									const parsedTarget = parseImageReference(imageRef);
									if (parsedTarget) {
										majorTargetTag = candidateTag;
										majorTargetImageRef = `${parsedTarget.repository}:${candidateTag}`;
									}
								}
							}
						} catch {
							majorUpdateAvailable = false;
							majorTargetImageRef = null;
							majorTargetTag = null;
						}
					}
				}
				const lastResult = updateAvailable
					? "available"
					: majorUpdateAvailable
						? "major_available"
						: "not_available";

				await upsertContainerUpdateState({
					userId: input.userId,
					environmentId: environment.id,
					containerName,
					containerId: container.ID,
					imageRef,
					runningImageId,
					latestImageId,
					majorTargetImageRef,
					majorTargetTag,
					updateAvailable,
					majorUpdateAvailable,
					lastResult,
					lastError: null,
					checkedAt: now(),
				});

				summary.checkedContainers += 1;
				if (updateAvailable) {
					summary.availableContainers += 1;
				}
			} catch (error) {
				await upsertContainerUpdateState({
					userId: input.userId,
					environmentId: environment.id,
					containerName,
					containerId: container.ID,
					imageRef: container.Image || null,
					runningImageId: null,
					latestImageId: null,
					majorTargetImageRef: null,
					majorTargetTag: null,
					updateAvailable: false,
					majorUpdateAvailable: false,
					lastResult: "check_failed",
					lastError: error instanceof Error ? error.message : "Check failed.",
					checkedAt: now(),
				});
				summary.failedContainers += 1;
			}
		}

		await completeUpdateRun({
			runId,
			status: "succeeded",
			summary: `Checked ${summary.checkedContainers}/${summary.totalContainers} containers.`,
			metrics: {
				...summary,
				queuedStacks: 0,
				updatedContainers: 0,
			},
		});

		return { environment, runId, ...summary };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Container update check failed.";
		await completeUpdateRun({
			runId,
			status: "failed",
			summary: "Container update check failed.",
			error: message,
			metrics: {
				totalContainers: 0,
				checkedContainers: 0,
				availableContainers: 0,
				queuedStacks: 0,
				updatedContainers: 0,
				skippedContainers: 0,
				failedContainers: 1,
			},
		});
		throw error;
	}
}

export async function runContainerUpdateApply(input: {
	userId: string;
	environmentId?: string;
	containerNames?: string[];
	respectPolicies?: boolean;
	updateOnlyRunning?: boolean;
	scheduleId?: string | null;
}) {
	const environment = await resolveRuntimeEnvironment(input.userId, input.environmentId);
	const runId = await createUpdateRun({
		userId: input.userId,
		environmentId: environment.id,
		runType: "update",
		scheduleId: input.scheduleId || null,
	});
	const respectPolicies = input.respectPolicies ?? false;
	const updateOnlyRunning = input.updateOnlyRunning ?? true;

	try {
		const { containers } = await listContainersForEnvironment(input.userId, environment.id);
		const requested = new Set(
			(input.containerNames || []).map((name) => name.trim()).filter(Boolean),
		);
		const targetContainers = containers.filter((container: Record<string, string>) => {
			const containerName = containerNameOf(container);
			if (!containerName) {
				return false;
			}
			if (!requested.size) {
				return true;
			}
			return requested.has(containerName);
		});
		const names = targetContainers
			.map((container: Record<string, string>) => containerNameOf(container))
			.filter(Boolean);
		const stateWhere =
			names.length > 0
				? and(
						eq(containerUpdateStates.environmentId, environment.id),
						eq(containerUpdateStates.createdByUserId, input.userId),
						inArray(containerUpdateStates.containerName, names),
					)
				: and(
						eq(containerUpdateStates.environmentId, environment.id),
						eq(containerUpdateStates.createdByUserId, input.userId),
					);
		const [policyRows, stateRows, stackRows] = await Promise.all([
			db.query.containerUpdatePolicies.findMany({
				where: and(
					eq(containerUpdatePolicies.environmentId, environment.id),
					eq(containerUpdatePolicies.createdByUserId, input.userId),
				),
			}),
			db.query.containerUpdateStates.findMany({
				where: stateWhere,
			}),
			db.query.stacks.findMany({
				where: and(
					eq(stacks.environmentId, environment.id),
					eq(stacks.createdByUserId, input.userId),
				),
				columns: { id: true, slug: true },
			}),
		]);

		const policies: ContainerUpdatePolicyMap = new Map(
			policyRows.map((row) => [
				row.containerName,
				{ id: row.id, checkEnabled: row.checkEnabled, updateEnabled: row.updateEnabled },
			]),
		);
		const states = new Map(stateRows.map((row) => [row.containerName, row]));
		const trackedStacksBySlug = new Map(stackRows.map((row) => [row.slug, row.id]));

		const summary: ContainerUpdateApplySummary = {
			totalContainers: targetContainers.length,
			updatedContainers: 0,
			queuedStacks: 0,
			skippedContainers: 0,
			failedContainers: 0,
		};
		const queuedStackIds: string[] = [];

		const stackContainers = new Map<string, Set<string>>();

		for (const container of targetContainers) {
			const containerName = containerNameOf(container);
			if (!containerName) {
				summary.skippedContainers += 1;
				continue;
			}
			if (environment.kind === "local" && isProtectedManagerContainer(container)) {
				summary.skippedContainers += 1;
				continue;
			}
			if (updateOnlyRunning && containerStateOf(container) !== "running") {
				summary.skippedContainers += 1;
				continue;
			}

			const policy = policies.get(containerName);
			if (respectPolicies && policy && !policy.updateEnabled) {
				summary.skippedContainers += 1;
				continue;
			}
			const state = states.get(containerName);
			if (!state?.updateAvailable) {
				summary.skippedContainers += 1;
				continue;
			}

			const composeProject = composeProjectOf(container);
			if (!composeProject) {
				summary.skippedContainers += 1;
				continue;
			}

			const trackedStackId = trackedStacksBySlug.get(composeProject);
			if (!trackedStackId) {
				summary.skippedContainers += 1;
				continue;
			}

			const namesForStack = stackContainers.get(trackedStackId) || new Set<string>();
			namesForStack.add(containerName);
			stackContainers.set(trackedStackId, namesForStack);
		}

		const successfullyQueuedContainerNames = new Set<string>();
		for (const [stackId, containerNames] of stackContainers.entries()) {
			try {
				await queueOrRunDeployment({
					stackId,
					userId: input.userId,
					operation: "deploy",
				});
				summary.queuedStacks += 1;
				queuedStackIds.push(stackId);
				for (const containerName of containerNames) {
					successfullyQueuedContainerNames.add(containerName);
				}
			} catch {
				summary.failedContainers += containerNames.size;
			}
		}

		const updateAt = now();
		for (const containerName of successfullyQueuedContainerNames) {
			summary.updatedContainers += 1;
			await upsertContainerUpdateState({
				userId: input.userId,
				environmentId: environment.id,
				containerName,
				updateAvailable: true,
				lastResult: "update_queued",
				updatedAt: updateAt,
			});
		}

		await completeUpdateRun({
			runId,
			status: "succeeded",
			summary: `Queued ${summary.queuedStacks} stack update(s).`,
			metrics: {
				totalContainers: summary.totalContainers,
				checkedContainers: 0,
				availableContainers: 0,
				queuedStacks: summary.queuedStacks,
				updatedContainers: summary.updatedContainers,
				skippedContainers: summary.skippedContainers,
				failedContainers: summary.failedContainers,
			},
		});

		return { environment, runId, queuedStackIds, ...summary };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Container update apply failed.";
		await completeUpdateRun({
			runId,
			status: "failed",
			summary: "Container update apply failed.",
			error: message,
			metrics: {
				totalContainers: 0,
				checkedContainers: 0,
				availableContainers: 0,
				queuedStacks: 0,
				updatedContainers: 0,
				skippedContainers: 0,
				failedContainers: 1,
			},
		});
		throw error;
	}
}

async function claimDueSchedules(workerId: string, maxSchedules: number) {
	const current = now();
	const due = await db.query.containerUpdateSchedules.findMany({
		where: and(
			or(
				and(
					eq(containerUpdateSchedules.autoCheckEnabled, true),
					or(
						isNull(containerUpdateSchedules.nextCheckAt),
						lt(containerUpdateSchedules.nextCheckAt, current),
					),
				),
				and(
					eq(containerUpdateSchedules.autoUpdateEnabled, true),
					or(
						isNull(containerUpdateSchedules.nextUpdateAt),
						lt(containerUpdateSchedules.nextUpdateAt, current),
					),
				),
			),
			or(
				isNull(containerUpdateSchedules.runningLeaseUntil),
				lt(containerUpdateSchedules.runningLeaseUntil, current),
			),
		),
		orderBy: [asc(containerUpdateSchedules.updatedAt)],
		limit: Math.max(1, Math.min(20, maxSchedules * 3)),
	});

	const claimed = [] as typeof due;
	for (const schedule of due) {
		const leasedUntil = addMinutes(current, 5);
		const rows = await db
			.update(containerUpdateSchedules)
			.set({
				runningLeaseUntil: leasedUntil,
				runningWorkerId: workerId,
				updatedAt: current,
			})
			.where(
				and(
					eq(containerUpdateSchedules.id, schedule.id),
					or(
						isNull(containerUpdateSchedules.runningLeaseUntil),
						lt(containerUpdateSchedules.runningLeaseUntil, current),
					),
				),
			)
			.returning();
		if (rows.length) {
			claimed.push(rows[0]);
		}
		if (claimed.length >= maxSchedules) {
			break;
		}
	}

	return claimed;
}

async function releaseScheduleLease(scheduleId: string, updatedAt = now()) {
	await db
		.update(containerUpdateSchedules)
		.set({
			runningLeaseUntil: null,
			runningWorkerId: null,
			updatedAt,
		})
		.where(eq(containerUpdateSchedules.id, scheduleId));
}

export async function processDueContainerUpdateSchedules(input?: {
	workerId?: string;
	maxSchedules?: number;
}) {
	const workerId = input?.workerId?.trim() || `worker-${randomUUID().slice(0, 12)}`;
	const maxSchedules = Math.max(1, Math.min(10, input?.maxSchedules || 3));
	const claimed = await claimDueSchedules(workerId, maxSchedules);

	const summary = {
		workerId,
		claimed: claimed.length,
		processed: 0,
		checksRun: 0,
		updatesRun: 0,
		errors: 0,
	};

	for (const schedule of claimed) {
		const startedAt = now();
		try {
			const runCheck =
				schedule.autoCheckEnabled && (!schedule.nextCheckAt || schedule.nextCheckAt <= startedAt);
			const runUpdate =
				schedule.autoUpdateEnabled &&
				(!schedule.nextUpdateAt || schedule.nextUpdateAt <= startedAt);

			if (runCheck) {
				summary.checksRun += 1;
				await runContainerUpdateCheck({
					userId: schedule.createdByUserId,
					environmentId: schedule.environmentId,
					respectPolicies: true,
					pullBeforeCheck: schedule.pullBeforeCheck,
					includeMajorVersions: schedule.checkMode === "include_major",
					scheduleId: schedule.id,
				});
			}

			if (runUpdate) {
				summary.updatesRun += 1;
				if (!runCheck) {
					await runContainerUpdateCheck({
						userId: schedule.createdByUserId,
						environmentId: schedule.environmentId,
						respectPolicies: true,
						pullBeforeCheck: schedule.pullBeforeCheck,
						includeMajorVersions: schedule.checkMode === "include_major",
						scheduleId: schedule.id,
					});
				}
				await runContainerUpdateApply({
					userId: schedule.createdByUserId,
					environmentId: schedule.environmentId,
					respectPolicies: true,
					updateOnlyRunning: schedule.updateOnlyRunning,
					scheduleId: schedule.id,
				});
			}

			const finishedAt = now();
			await db
				.update(containerUpdateSchedules)
				.set({
					lastCheckAt: runCheck ? finishedAt : schedule.lastCheckAt,
					lastUpdateAt: runUpdate ? finishedAt : schedule.lastUpdateAt,
					nextCheckAt: runCheck
						? addMinutes(finishedAt, clampIntervalMinutes(schedule.checkIntervalMinutes, 60))
						: schedule.nextCheckAt,
					nextUpdateAt: runUpdate
						? addMinutes(finishedAt, clampIntervalMinutes(schedule.updateIntervalMinutes, 240))
						: schedule.nextUpdateAt,
					runningLeaseUntil: null,
					runningWorkerId: null,
					updatedAt: finishedAt,
				})
				.where(eq(containerUpdateSchedules.id, schedule.id));

			summary.processed += 1;
		} catch {
			summary.errors += 1;
			await releaseScheduleLease(schedule.id, now());
		}
	}

	return summary;
}
