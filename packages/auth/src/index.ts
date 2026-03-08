import { db, schema } from "@dockroot/db";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count } from "drizzle-orm";

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

function publicSignupsAllowed() {
	return process.env.DOCKROOT_ALLOW_PUBLIC_SIGNUP === "true";
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
	user: {
		additionalFields: {
			role: {
				type: "string",
				required: false,
				defaultValue: "member",
			},
		},
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
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					const [{ value: existingUsers }] = await db.select({ value: count() }).from(schema.user);

					if (!existingUsers) {
						return {
							data: {
								...user,
								role: "owner",
							},
						};
					}

					if (!publicSignupsAllowed()) {
						throw new APIError("FORBIDDEN", {
							message: "Public sign-up is disabled for this instance.",
						});
					}

					return {
						data: {
							...user,
							role: "member",
						},
					};
				},
			},
		},
	},
});
