import { defineConfig } from "drizzle-kit";
import { getDatabaseUrl } from "./scripts/database-url.mjs";

export default defineConfig({
	dialect: "postgresql",
	schema: "./packages/db/src/schema/index.ts",
	out: "./packages/db/drizzle",
	dbCredentials: {
		url: getDatabaseUrl(),
	},
});
