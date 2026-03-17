import { NextResponse } from "next/server";
import { appendDeploymentLogEvents } from "@/lib/platform";

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

	try {
		const body = (await request.json()) as Array<{
			stream?: "stdout" | "stderr";
			message?: string;
			at?: number;
		}>;
		const { deploymentId } = await params;

		await appendDeploymentLogEvents({
			deploymentId,
			accessToken: token,
			events: Array.isArray(body) ? body : [],
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unable to append deployment logs";
		return new NextResponse(message, { status: 400 });
	}
}
