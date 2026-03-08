import { NextResponse } from "next/server";
import { getDeploymentSourceArchive } from "@/lib/platform";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return null;
	}

	return authHeader.slice("Bearer ".length);
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ deploymentId: string }> },
) {
	const token = getBearerToken(request);

	if (!token) {
		return new NextResponse("Missing bearer token", { status: 401 });
	}

	try {
		const { deploymentId } = await params;
		const archive = await getDeploymentSourceArchive({
			deploymentId,
			accessToken: token,
		});

		return new NextResponse(new Uint8Array(archive), {
			headers: {
				"content-type": "application/gzip",
				"cache-control": "no-store",
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unable to fetch deployment source";
		return new NextResponse(message, { status: 400 });
	}
}
