const PLACEHOLDER_PATTERNS = [
	/change-me/i,
	/replace-with/i,
	/example\.com/i,
	/your-[a-z0-9-]+/i,
];

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

	const databaseUrl = readEnv("DATABASE_URL");
	const betterAuthSecret = readEnv("BETTER_AUTH_SECRET");
	const betterAuthUrl = readEnv("BETTER_AUTH_URL");
	const appUrl = readEnv("NEXT_PUBLIC_APP_URL");
	const tokenPepper = readEnv("DOCKROOT_TOKEN_PEPPER");
	const metricsToken = readEnv("METRICS_BEARER_TOKEN");

	const requiredPairs = [
		["BETTER_AUTH_SECRET", betterAuthSecret],
		["BETTER_AUTH_URL", betterAuthUrl],
		["NEXT_PUBLIC_APP_URL", appUrl],
		["DOCKROOT_TOKEN_PEPPER", tokenPepper],
		["METRICS_BEARER_TOKEN", metricsToken],
	];

	if (!compose) {
		requiredPairs.unshift(["DATABASE_URL", databaseUrl]);
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
		validateUrl("BETTER_AUTH_URL", betterAuthUrl, errors);
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
					`BETTER_AUTH_URL (${authOrigin}) does not match NEXT_PUBLIC_APP_URL (${appOrigin}). This is only safe if you intentionally split auth and app origins.`,
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
			["BETTER_AUTH_URL", betterAuthUrl],
			["NEXT_PUBLIC_APP_URL", appUrl],
		]) {
			if (value && looksLikePlaceholder(value)) {
				errors.push(`${name} still uses a placeholder value.`);
			}
		}

		if (betterAuthUrl && /^http:\/\/localhost(?::\d+)?$/i.test(betterAuthUrl)) {
			errors.push("BETTER_AUTH_URL cannot use localhost in production.");
		}

		if (appUrl && /^http:\/\/localhost(?::\d+)?$/i.test(appUrl)) {
			errors.push("NEXT_PUBLIC_APP_URL cannot use localhost in production.");
		}

		if (!isTruthy(readEnv("SESSION_COOKIE_SECURE"))) {
			warnings.push("SESSION_COOKIE_SECURE is false in production. Cookies will not be marked secure.");
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

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
