import { NextResponse } from "next/server";
import { heartbeatAgent } from "@/lib/platform";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return null;
	}
	return authHeader.slice("Bearer ".length);
}

export async function POST(request: Request) {
	const token = getBearerToken(request);

	if (!token) {
		return new NextResponse("Missing bearer token", { status: 401 });
	}

	try {
		await heartbeatAgent(token);
		return NextResponse.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Heartbeat failed";
		return new NextResponse(message, { status: 401 });
	}
}
