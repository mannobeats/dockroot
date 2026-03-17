import { NextResponse } from "next/server";
import { heartbeatAgent } from "@/lib/platform";
import { emitRealtime } from "@/lib/realtime";

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
		const agent = await heartbeatAgent(token);
		const events = await request.json();

		if (!Array.isArray(events)) {
			return new NextResponse("Expected array of events", { status: 400 });
		}

		for (const event of events) {
			const { containerId, action } = event;

			if (!containerId || !action) {
				continue;
			}

			emitRealtime("container:state", {
				containerId,
				action,
				ok: true,
				at: Date.now(),
				source: "daemon",
				environmentId: agent.environmentId,
			});
		}

		return NextResponse.json({ ok: true, received: events.length });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Event push failed";
		return new NextResponse(message, { status: 401 });
	}
}
