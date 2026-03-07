import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function getDatabaseUrl() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("Missing required environment variable: DATABASE_URL");
	}
	return databaseUrl;
}

const client = postgres(getDatabaseUrl());
export const db = drizzle(client, { schema });
export { schema };
export * from "./schema";
