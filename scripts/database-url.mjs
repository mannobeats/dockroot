function readEnv(env, name) {
	const value = env[name];
	return typeof value === "string" ? value.trim() : "";
}

function encodePart(value) {
	return encodeURIComponent(value);
}

export function buildDatabaseUrlFromParts(env = process.env) {
	const host = readEnv(env, "POSTGRES_HOST") || "localhost";
	const port = readEnv(env, "POSTGRES_PORT") || "5432";
	const database = readEnv(env, "POSTGRES_DB") || "dockroot";
	const user = readEnv(env, "POSTGRES_USER") || "postgres";
	const password = readEnv(env, "POSTGRES_PASSWORD");

	if (!password) {
		return "";
	}

	return `postgresql://${encodePart(user)}:${encodePart(password)}@${host}:${port}/${database}`;
}

export function getDatabaseUrl(env = process.env) {
	const explicitUrl = readEnv(env, "DATABASE_URL");
	if (explicitUrl) {
		return explicitUrl;
	}

	const derivedUrl = buildDatabaseUrlFromParts(env);
	if (derivedUrl) {
		return derivedUrl;
	}

	throw new Error(
		"Missing database configuration. Set DATABASE_URL or provide POSTGRES_PASSWORD with optional POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, and POSTGRES_USER.",
	);
}
