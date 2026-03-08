import { NextResponse } from "next/server";
import { getMetricsRegistry } from "@/lib/monitoring";

export const runtime = "nodejs";

export async function GET() {
	const registry = await getMetricsRegistry();

	return new NextResponse(await registry.metrics(), {
		headers: {
			"content-type": registry.contentType,
		},
	});
}
