import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

function getDatabaseUrl() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("Missing required environment variable: DATABASE_URL");
	}
	return databaseUrl;
}

const client = postgres(getDatabaseUrl(), { max: 1 });
const db = drizzle(client);

async function main() {
	console.log("⏳ Running database migrations...");
	await migrate(db, { migrationsFolder: "./packages/db/drizzle" });
	console.log("✅ Migrations complete");
	await client.end();
	process.exit(0);
}

main().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
