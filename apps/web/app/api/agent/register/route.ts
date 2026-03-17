import { NextResponse } from "next/server";
import { inferAgentUrlFromHeaders, inferRequestManagerUrl } from "@/lib/manager-url";
import { registerAgent } from "@/lib/platform";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const payload = await request.json().catch(() => null);

	if (!payload?.registrationToken) {
		return new NextResponse("registrationToken is required", { status: 400 });
	}

	try {
		const result = await registerAgent({
			registrationToken: String(payload.registrationToken),
			hostname: payload.hostname ? String(payload.hostname) : undefined,
			operatingSystem: payload.operatingSystem ? String(payload.operatingSystem) : undefined,
			architecture: payload.architecture ? String(payload.architecture) : undefined,
			dockerVersion: payload.dockerVersion ? String(payload.dockerVersion) : undefined,
			agentUrl: inferAgentUrlFromHeaders(request.headers) || undefined,
			managerUrl: inferRequestManagerUrl(request.headers) || undefined,
		});

		return new NextResponse(
			`AGENT_ID=${result.agentId}\nENVIRONMENT_ID=${result.environmentId}\nAGENT_TOKEN=${result.accessToken}\nMANAGER_URL=${result.managerUrl}\n`,
			{
				headers: {
					"content-type": "text/plain; charset=utf-8",
				},
			},
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unable to register agent";
		return new NextResponse(message, { status: 400 });
	}
}
