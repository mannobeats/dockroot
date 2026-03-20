import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/authorization";
import { getContainerLogsForEnvironment } from "@/lib/environment-runtime";
import { requireAccessibleContainerForUser } from "@/lib/runtime-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
	const auth = await requireUserSession(request.headers);
	const url = new URL(request.url);
	const environmentId = url.searchParams.get("environmentId") || undefined;
	const containerId = url.searchParams.get("containerId");
	const tail = Number(url.searchParams.get("tail") || "150");

	if (!containerId) {
		return new NextResponse("containerId is required", { status: 400 });
	}

	try {
		await requireAccessibleContainerForUser({
			containerId,
			userId: auth.userId,
			role: auth.role,
			environmentId,
		});
		const { logs } = await getContainerLogsForEnvironment(auth.userId, containerId, environmentId, {
			tail,
		});
		return new NextResponse(logs, {
			headers: {
				"content-type": "text/plain; charset=utf-8",
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unable to load logs";
		return new NextResponse(message, { status: 400 });
	}
}
