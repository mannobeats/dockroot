import { db, schema } from "@dockroot/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

function getRequiredEnv(name: string) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function getTrustedOrigins() {
	return [
		process.env.BETTER_AUTH_URL,
		process.env.NEXT_PUBLIC_APP_URL,
		...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
	]
		.map((origin) => origin?.trim())
		.filter((origin): origin is string => Boolean(origin))
		.filter((origin, index, all) => all.indexOf(origin) === index);
}

export const auth = betterAuth({
	secret: getRequiredEnv("BETTER_AUTH_SECRET"),
	baseURL: getRequiredEnv("BETTER_AUTH_URL"),
	trustedOrigins: getTrustedOrigins(),
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	emailAndPassword: {
		enabled: true,
	},
	rateLimit: {
		enabled: true,
		window: 60,
		max: 10,
	},
	advanced: {
		useSecureCookies:
			process.env.SESSION_COOKIE_SECURE === undefined
				? process.env.NODE_ENV === "production"
				: process.env.SESSION_COOKIE_SECURE === "true",
	},
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},
});
