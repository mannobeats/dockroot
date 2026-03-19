import { NextResponse } from "next/server";
import { persistRuntimeSnapshotMetrics } from "@/lib/runtime-metrics";

function isInternalRequestAuthorized(request: Request) {
	const expected = process.env.DOCKROOT_TOKEN_PEPPER || "";
	const received = request.headers.get("x-dockroot-internal-token") || "";
	return expected && received && expected === received;
}

export async function POST(request: Request) {
	if (!isInternalRequestAuthorized(request)) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	try {
		const body = await request.json();
		await persistRuntimeSnapshotMetrics({
			environmentId: body.environmentId,
			snapshot: body.snapshot,
			source: body.source || "agent",
		});
		return NextResponse.json({ ok: true });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Failed to persist metrics" },
			{ status: 500 },
		);
	}
}
