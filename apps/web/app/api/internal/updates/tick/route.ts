import { NextResponse } from "next/server";
import { processDueContainerUpdateSchedules } from "@/lib/container-updates";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const token = request.headers.get("x-dockroot-internal-token") || "";
	if (!token || token !== (process.env.DOCKROOT_TOKEN_PEPPER || "")) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = (await request.json().catch(() => ({}))) as {
			workerId?: string;
			maxSchedules?: number;
		};
		const summary = await processDueContainerUpdateSchedules({
			workerId: body.workerId,
			maxSchedules: body.maxSchedules,
		});
		return NextResponse.json({ ok: true, summary });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Scheduler tick failed." },
			{ status: 500 },
		);
	}
}
