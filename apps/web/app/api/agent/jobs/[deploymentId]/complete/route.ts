import { NextResponse } from "next/server";
import { completeDeployment } from "@/lib/platform";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return null;
	}
	return authHeader.slice("Bearer ".length);
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ deploymentId: string }> },
) {
	const token = getBearerToken(request);

	if (!token) {
		return new NextResponse("Missing bearer token", { status: 401 });
	}

	const url = new URL(request.url);
	const status = url.searchParams.get("status");

	if (status !== "succeeded" && status !== "failed") {
		return new NextResponse("Invalid status", { status: 400 });
	}

	try {
		const body = await request.text();
		const { deploymentId } = await params;

		await completeDeployment({
			deploymentId,
			accessToken: token,
			status,
			log: body,
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unable to complete deployment";
		return new NextResponse(message, { status: 400 });
	}
}
