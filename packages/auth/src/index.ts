import { db, schema } from "@dockroot/db";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count, sql } from "drizzle-orm";

function getRequiredEnv(name: string) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function getAppUrl() {
	return (
		process.env.APP_URL || process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ""
	);
}

function getTrustedOrigins() {
	return [
		getAppUrl(),
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
	baseURL: getAppUrl() || getRequiredEnv("BETTER_AUTH_URL"),
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
		max: 120,
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
					const ownerRows = await db.execute<{ key: string }>(sql`
							with reset as (
								delete from "instance_bootstrap"
								where "key" = 'owner-bootstrap'
								  and not exists (select 1 from "user")
								  and not exists (select 1 from "user" where "role" = 'owner')
								returning "key"
							),
							claim as (
								insert into "instance_bootstrap" ("key")
								select 'owner-bootstrap'
								where not exists (select 1 from "user" where "role" = 'owner')
								on conflict do nothing
								returning "key"
							)
							select "key" from claim
						`);

					if (ownerRows.length > 0) {
						return {
							data: {
								...user,
								role: "owner",
							},
						};
					}

					if (!existingUsers) {
						throw new APIError("FORBIDDEN", {
							message: "Instance bootstrap is already in progress. Please try again.",
						});
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
