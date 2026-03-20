import { db, schema } from "@dockroot/db";
import { count, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export function GET() {
	return NextResponse.json({ status: "ok" });
}

function isInternalRequestAuthorized(request: Request) {
	const token = request.headers.get("x-dockroot-internal-token") || "";
	return Boolean(token) && token === (process.env.DOCKROOT_TOKEN_PEPPER || "");
}

export async function POST(request: Request) {
	if (!isInternalRequestAuthorized(request)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const checks: Record<string, unknown> = {};

	try {
		const [{ value: userCount }] = await db.select({ value: count() }).from(schema.user);
		checks.userCount = userCount;
	} catch (error) {
		checks.userCount = `error: ${error instanceof Error ? error.message : "unknown"}`;
	}

	try {
		const rows = await db.execute<{ key: string }>(
			sql`select "key" from "instance_bootstrap" where "key" = 'owner-bootstrap'`,
		);
		checks.ownerBootstrapClaimed = rows.length > 0;
	} catch (error) {
		checks.instanceBootstrapTable = `error: ${error instanceof Error ? error.message : "unknown"}`;
	}

	try {
		const ownerRows = await db.execute<{ id: string }>(
			sql`select "id" from "user" where "role" = 'owner' limit 1`,
		);
		checks.hasOwner = ownerRows.length > 0;
	} catch (error) {
		checks.roleColumn = `error: ${error instanceof Error ? error.message : "unknown"}`;
	}

	checks.appUrl = process.env.APP_URL || "(auto-detect)";
	checks.betterAuthUrl = process.env.BETTER_AUTH_URL || "(not set)";
	checks.sessionCookieSecure = process.env.SESSION_COOKIE_SECURE ?? "(not set)";
	checks.nodeEnv = process.env.NODE_ENV || "(not set)";
	checks.signupEnabled =
		process.env.DOCKROOT_ALLOW_PUBLIC_SIGNUP === "true" ? "public" : "owner-only";

	return NextResponse.json({ status: "ok", checks });
}
