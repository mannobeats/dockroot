const PLACEHOLDER_PATTERNS = [
	/change-me/i,
	/replace-with/i,
	/example\.com/i,
	/your-[a-z0-9-]+/i,
];
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildDatabaseUrlFromParts } from "./database-url.mjs";

function readEnv(name) {
	const value = process.env[name]?.trim();
	return value ? value : "";
}

function looksLikePlaceholder(value) {
	return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function isTruthy(value) {
	return value === "true";
}

function validateUrl(name, value, errors) {
	try {
		// eslint-disable-next-line no-new
		new URL(value);
	} catch {
		errors.push(`${name} must be a valid absolute URL.`);
	}
}

function hasAmbiguousDatabaseCredentials(databaseUrl) {
	const match = databaseUrl.match(/^[a-z0-9+.-]+:\/\/([^/]+)@/i);
	if (!match) {
		return false;
	}

	return (match[1].match(/@/g) ?? []).length > 0;
}

export function validateRuntimeEnv({
	production = process.env.NODE_ENV === "production",
	compose = false,
} = {}) {
	const errors = [];
	const warnings = [];

	const databaseUrl = readEnv("DATABASE_URL") || buildDatabaseUrlFromParts(process.env);
	const configuredAppUrl = readEnv("APP_URL");
	const betterAuthSecret = readEnv("BETTER_AUTH_SECRET");
	const betterAuthUrl = readEnv("BETTER_AUTH_URL") || configuredAppUrl;
	const appUrl = readEnv("NEXT_PUBLIC_APP_URL") || configuredAppUrl;
	const tokenPepper = readEnv("DOCKROOT_TOKEN_PEPPER");
	const metricsToken = readEnv("METRICS_BEARER_TOKEN");

	const requiredPairs = [
		["BETTER_AUTH_SECRET", betterAuthSecret],
		["DOCKROOT_TOKEN_PEPPER", tokenPepper],
		["METRICS_BEARER_TOKEN", metricsToken],
	];

	if (!compose && !databaseUrl) {
		errors.push(
			"Missing database configuration. Set DATABASE_URL or provide POSTGRES_PASSWORD with optional POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, and POSTGRES_USER.",
		);
	}

	for (const [name, value] of requiredPairs) {
		if (!value) {
			errors.push(`Missing required environment variable: ${name}`);
		}
	}

	if (databaseUrl && hasAmbiguousDatabaseCredentials(databaseUrl)) {
		errors.push(
			"DATABASE_URL contains an unencoded '@' in the credentials section. URL-encode special characters or use a password with only URL-safe characters.",
		);
	}

	if (betterAuthUrl) {
		validateUrl("APP_URL", betterAuthUrl, errors);
	}

	if (appUrl) {
		validateUrl("NEXT_PUBLIC_APP_URL", appUrl, errors);
	}

	if (betterAuthUrl && appUrl) {
		try {
				const authOrigin = new URL(betterAuthUrl).origin;
				const appOrigin = new URL(appUrl).origin;
				if (authOrigin !== appOrigin) {
					warnings.push(
						`Derived auth origin (${authOrigin}) does not match derived app origin (${appOrigin}). This is only safe if you intentionally split auth and app origins.`,
					);
				}
		} catch {
			// URL parse failures are already reported above.
		}
	}

	for (const [name, value] of [
		["BETTER_AUTH_SECRET", betterAuthSecret],
		["DOCKROOT_TOKEN_PEPPER", tokenPepper],
		["METRICS_BEARER_TOKEN", metricsToken],
	]) {
		if (value && value.length < 24) {
			errors.push(`${name} must be at least 24 characters long.`);
		}
	}

	if (production) {
		for (const [name, value] of [
			["BETTER_AUTH_SECRET", betterAuthSecret],
			["DOCKROOT_TOKEN_PEPPER", tokenPepper],
			["METRICS_BEARER_TOKEN", metricsToken],
		]) {
			if (value && looksLikePlaceholder(value)) {
				errors.push(`${name} still uses a placeholder value.`);
			}
		}

		if (configuredAppUrl && looksLikePlaceholder(configuredAppUrl)) {
			errors.push("APP_URL still uses a placeholder value.");
		}

		if (!configuredAppUrl && !betterAuthUrl && !appUrl) {
			warnings.push("APP_URL is not set. Dockroot will auto-detect the URL from incoming requests. Set APP_URL for explicit control.");
		}
	}

	return { errors, warnings };
}

function main() {
	const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";
	const compose = process.argv.includes("--compose");
	const { errors, warnings } = validateRuntimeEnv({ production, compose });

	if (warnings.length > 0) {
		console.warn("Environment warnings:");
		for (const warning of warnings) {
			console.warn(`- ${warning}`);
		}
	}

	if (errors.length > 0) {
		console.error("Environment validation failed:");
		for (const error of errors) {
			console.error(`- ${error}`);
		}
		process.exit(1);
	}
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
	main();
}
