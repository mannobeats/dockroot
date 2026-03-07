import { defineConfig } from "drizzle-kit";

function getDatabaseUrl() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("Missing required environment variable: DATABASE_URL");
	}
	return databaseUrl;
}

export default defineConfig({
	dialect: "postgresql",
	schema: "./packages/db/src/schema/index.ts",
	out: "./packages/db/drizzle",
	dbCredentials: {
		url: getDatabaseUrl(),
	},
});
