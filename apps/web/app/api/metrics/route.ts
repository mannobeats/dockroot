import { NextResponse } from "next/server";
import { requirePrivilegedSession } from "@/lib/authorization";
import { getMetricsRegistry } from "@/lib/monitoring";

export const runtime = "nodejs";

function isAuthorizedByBearerToken(request: Request) {
	const expected = process.env.METRICS_BEARER_TOKEN;
	if (!expected) {
		return false;
	}

	const header = request.headers.get("authorization");
	return header === `Bearer ${expected}`;
}

export async function GET(request: Request) {
	if (!isAuthorizedByBearerToken(request)) {
		try {
			await requirePrivilegedSession(request.headers);
		} catch {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
	}

	const registry = await getMetricsRegistry();

	return new NextResponse(await registry.metrics(), {
		headers: {
			"content-type": registry.contentType,
		},
	});
}
