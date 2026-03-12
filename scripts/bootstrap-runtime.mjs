import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function readEnv(name) {
	const value = process.env[name];
	return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
	const envFiles = [];
	let writeEnvFile = "";
	let writePostgresPasswordFile = "";
	let writeMetricsTokenFile = "";
	let format = "";

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		if (value === "--env-file") {
			envFiles.push(argv[index + 1] || "");
			index += 1;
			continue;
		}
		if (value === "--write-env-file") {
			writeEnvFile = argv[index + 1] || "";
			index += 1;
			continue;
		}
		if (value === "--write-postgres-password-file") {
			writePostgresPasswordFile = argv[index + 1] || "";
			index += 1;
			continue;
		}
		if (value === "--write-metrics-token-file") {
			writeMetricsTokenFile = argv[index + 1] || "";
			index += 1;
			continue;
		}
		if (value === "--format") {
			format = argv[index + 1] || "";
			index += 1;
		}
	}

	return {
		envFiles: envFiles.filter(Boolean),
		writeEnvFile,
		writePostgresPasswordFile,
		writeMetricsTokenFile,
		format,
	};
}

function parseEnvFile(content) {
	const entries = {};

	for (const rawLine of content.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const separator = line.indexOf("=");
		if (separator === -1) {
			continue;
		}

		const key = line.slice(0, separator).trim();
		let value = line.slice(separator + 1).trim();
		if (!key) {
			continue;
		}

		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		entries[key] = value.replace(/\\n/g, "\n");
	}

	return entries;
}

export async function loadEnvFiles(envFiles) {
	for (const envFile of envFiles) {
		if (!envFile || !existsSync(envFile)) {
			continue;
		}

		const parsed = parseEnvFile(await readFile(envFile, "utf8"));
		for (const [key, value] of Object.entries(parsed)) {
			if (!process.env[key]) {
				process.env[key] = value;
			}
		}
	}
}

function randomSecret(bytes = 32) {
	return randomBytes(bytes).toString("hex");
}

async function readJson(filePath, fallback) {
	try {
		return JSON.parse(await readFile(filePath, "utf8"));
	} catch {
		return fallback;
	}
}

async function readText(filePath) {
	try {
		return (await readFile(filePath, "utf8")).trim();
	} catch {
		return "";
	}
}

function getDefaultDataDir() {
	return readEnv("DOCKROOT_DATA_DIR") || path.join(process.cwd(), ".dockroot");
}

function getDefaultProfile() {
	return readEnv("DOCKROOT_RUNTIME_PROFILE") || "local";
}

function getDefaultAppUrl() {
	return readEnv("APP_URL") || readEnv("NEXT_PUBLIC_APP_URL") || readEnv("BETTER_AUTH_URL") || "";
}

function shouldUseSecureCookies(appUrl) {
	try {
		return new URL(appUrl).protocol === "https:";
	} catch {
		return false;
	}
}

function encodeEnvValue(value) {
	return value.replace(/\n/g, "\\n");
}

function shellQuote(value) {
	return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function writeIfMissing(name, value) {
	if (!process.env[name]) {
		process.env[name] = value;
	}
}

export async function applyRuntimeBootstrap(options = {}) {
	const profile = options.profile || getDefaultProfile();
	const dataDir = options.dataDir || getDefaultDataDir();
	const bootstrapDir = path.join(dataDir, "bootstrap");
	const secretStateFile = path.join(bootstrapDir, "runtime-secrets.json");
	const existingPostgresPasswordFile =
		options.writePostgresPasswordFile || path.join(bootstrapDir, "postgres_password");
	const existingMetricsTokenFile =
		options.writeMetricsTokenFile || path.join(bootstrapDir, "metrics_token");

	await mkdir(bootstrapDir, { recursive: true });

	const secretState = await readJson(secretStateFile, {});
	const existingPostgresPassword = await readText(existingPostgresPasswordFile);
	const existingMetricsToken = await readText(existingMetricsTokenFile);
	const nextSecrets = {
		postgresPassword:
			readEnv("POSTGRES_PASSWORD") ||
			existingPostgresPassword ||
			secretState.postgresPassword ||
			randomSecret(24),
		betterAuthSecret:
			readEnv("BETTER_AUTH_SECRET") || secretState.betterAuthSecret || randomSecret(32),
		tokenPepper: readEnv("DOCKROOT_TOKEN_PEPPER") || secretState.tokenPepper || randomSecret(32),
		metricsBearerToken:
			readEnv("METRICS_BEARER_TOKEN") ||
			existingMetricsToken ||
			secretState.metricsBearerToken ||
			randomSecret(32),
	};

	await writeFile(secretStateFile, `${JSON.stringify(nextSecrets, null, 2)}\n`, "utf8");

	writeIfMissing("DOCKROOT_DATA_DIR", dataDir);
	writeIfMissing("DOCKROOT_RUNTIME_PROFILE", profile);
	writeIfMissing("POSTGRES_DB", "dockroot");
	writeIfMissing("POSTGRES_USER", "dockroot");
	writeIfMissing("POSTGRES_PORT", "5432");
	writeIfMissing("POSTGRES_HOST", profile === "docker" ? "postgres" : "localhost");
	writeIfMissing("PROMETHEUS_URL", profile === "docker" ? "http://prometheus:9090" : "http://localhost:9090");
	writeIfMissing("NEXT_PUBLIC_APP_NAME", "Dockroot");
	writeIfMissing("DOCKROOT_ALLOW_PUBLIC_SIGNUP", "false");

	const appUrl = getDefaultAppUrl();
	if (appUrl) {
		writeIfMissing("APP_URL", appUrl);
		writeIfMissing("BETTER_AUTH_URL", appUrl);
		writeIfMissing("NEXT_PUBLIC_APP_URL", appUrl);
		writeIfMissing("BETTER_AUTH_TRUSTED_ORIGINS", appUrl);
		writeIfMissing("SESSION_COOKIE_SECURE", shouldUseSecureCookies(appUrl) ? "true" : "false");
	}

	writeIfMissing("POSTGRES_PASSWORD", nextSecrets.postgresPassword);
	writeIfMissing("BETTER_AUTH_SECRET", nextSecrets.betterAuthSecret);
	writeIfMissing("DOCKROOT_TOKEN_PEPPER", nextSecrets.tokenPepper);
	writeIfMissing("METRICS_BEARER_TOKEN", nextSecrets.metricsBearerToken);

	const runtimeEnv = {
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || nextSecrets.betterAuthSecret,
		DOCKROOT_ALLOW_PUBLIC_SIGNUP: process.env.DOCKROOT_ALLOW_PUBLIC_SIGNUP || "false",
		DOCKROOT_DATA_DIR: process.env.DOCKROOT_DATA_DIR || dataDir,
		DOCKROOT_RUNTIME_PROFILE: process.env.DOCKROOT_RUNTIME_PROFILE || profile,
		DOCKROOT_TOKEN_PEPPER: process.env.DOCKROOT_TOKEN_PEPPER || nextSecrets.tokenPepper,
		GITHUB_APP_STATE_SECRET: process.env.GITHUB_APP_STATE_SECRET || "",
		METRICS_BEARER_TOKEN: process.env.METRICS_BEARER_TOKEN || nextSecrets.metricsBearerToken,
		NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Dockroot",
		PORT: process.env.PORT || "3080",
		POSTGRES_DB: process.env.POSTGRES_DB || "dockroot",
		POSTGRES_HOST: process.env.POSTGRES_HOST || (profile === "docker" ? "postgres" : "localhost"),
		POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || nextSecrets.postgresPassword,
		POSTGRES_PORT: process.env.POSTGRES_PORT || "5432",
		POSTGRES_USER: process.env.POSTGRES_USER || "dockroot",
		PROMETHEUS_URL:
			process.env.PROMETHEUS_URL ||
			(profile === "docker" ? "http://prometheus:9090" : "http://localhost:9090"),
	};

	if (appUrl) {
		runtimeEnv.APP_URL = process.env.APP_URL || appUrl;
		runtimeEnv.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || appUrl;
		runtimeEnv.BETTER_AUTH_TRUSTED_ORIGINS = process.env.BETTER_AUTH_TRUSTED_ORIGINS || appUrl;
		runtimeEnv.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || appUrl;
		runtimeEnv.SESSION_COOKIE_SECURE =
			process.env.SESSION_COOKIE_SECURE || (shouldUseSecureCookies(appUrl) ? "true" : "false");
	}

	if (options.writeEnvFile) {
		await mkdir(path.dirname(options.writeEnvFile), { recursive: true });
		const lines = Object.entries(runtimeEnv).map(([key, value]) => `${key}=${encodeEnvValue(value)}`);
		await writeFile(options.writeEnvFile, `${lines.join("\n")}\n`, "utf8");
	}

	if (options.writePostgresPasswordFile) {
		await mkdir(path.dirname(options.writePostgresPasswordFile), { recursive: true });
		await writeFile(options.writePostgresPasswordFile, `${runtimeEnv.POSTGRES_PASSWORD}\n`, "utf8");
	}

	if (options.writeMetricsTokenFile) {
		await mkdir(path.dirname(options.writeMetricsTokenFile), { recursive: true });
		await writeFile(options.writeMetricsTokenFile, `${runtimeEnv.METRICS_BEARER_TOKEN}\n`, "utf8");
	}

	return runtimeEnv;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	await loadEnvFiles(args.envFiles);
	const runtimeEnv = await applyRuntimeBootstrap({
		writeEnvFile: args.writeEnvFile,
		writePostgresPasswordFile: args.writePostgresPasswordFile,
		writeMetricsTokenFile: args.writeMetricsTokenFile,
	});

	if (args.format === "shell") {
		for (const [key, value] of Object.entries(runtimeEnv)) {
			process.stdout.write(`export ${key}=${shellQuote(value)}\n`);
		}
	}
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
